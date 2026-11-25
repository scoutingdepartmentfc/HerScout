"""
scripts/tm_club_identity.py
Extrae de Transfermarkt la relación Club Matriz (id_identidad) ↔ Equipos/Filiales
leyendo el desplegable del icono `+` (`data-header__toggle-icon`) de cada club
y lo exporta a un archivo Excel (.xlsx).

Todo el estado vive en el propio Excel (no hay JSON auxiliar):
  - Hoja "TM_Club_Identities": resultado (club matriz ↔ equipos).
  - Hoja "Cola":   un club por fila con su estado (pendiente / ok / sin_datos / error).
  - Hoja "Ligas":  ligas ya escaneadas y cuántos clubes aportaron.
Puedes cortar el script en cualquier momento (Ctrl+C) y relanzarlo con el mismo
--out: continúa justo donde se quedó.

Ritmo "poco a poco" para no ser bloqueado:
  - Espera aleatoria entre peticiones (--min-delay / --max-delay, por defecto 6-12 s).
  - Tandas de --batch peticiones con descanso de --pause-minutes entre tandas.
  - Tope de peticiones por ejecución (--max-requests) para repartirlo en varios días.
  - Ante 429/403/503 hace backoff largo.
  - Si Transfermarkt muestra la verificación humana (AWS WAF), abre la página en
    una ventana de Chrome (Playwright), suena un aviso y espera a que la resuelvas
    (si es solo el reto JS, se resuelve sola). Después copia la cookie
    `aws-waf-token` a la sesión y sigue sin cortarse. Con --no-browser vuelve al
    comportamiento antiguo (guardar y parar).

Uso:
    # Por IDs de club:
    python3 scripts/tm_club_identity.py --clubs 418 131 621 --out tm_identidades.xlsx

    # Por códigos de competición (ej. ES1, GB1, DE1, IT1, FR1):
    python3 scripts/tm_club_identity.py --leagues ES1 ES2 --out tm_identidades.xlsx

    # Todo el catálogo, 150 peticiones al día:
    python3 scripts/tm_club_identity.py --all-leagues --max-requests 150 --out tm_identidades.xlsx

    # Ver el estado sin hacer peticiones:
    python3 scripts/tm_club_identity.py --status --out tm_identidades.xlsx
"""

import argparse
import random
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import subprocess

import openpyxl
import requests
from bs4 import BeautifulSoup

BASE = "https://www.transfermarkt.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

SHEET_ROWS = "TM_Club_Identities"
SHEET_QUEUE = "Cola"
SHEET_LEAGUES = "Ligas"
ROW_HEADERS = ["id_identidad", "nombre_identidad", "tm_id_equipo", "nombre_equipo", "pais", "estadio", "url_transfermarkt"]
QUEUE_HEADERS = ["tm_id_club", "origen", "estado", "n_equipos", "id_identidad", "intentos", "actualizado"]
LEAGUE_HEADERS = ["codigo", "estado", "n_clubes", "actualizado"]

MAX_ATTEMPTS = 3  # intentos por club antes de dejarlo en "error" definitivo
BROWSER_PROFILE = Path(__file__).resolve().parent.parent / ".tm_browser_profile"


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


# ---------------------------------------------------------------------------
# Cliente HTTP con ritmo controlado
# ---------------------------------------------------------------------------

class Blocked(Exception):
    """Transfermarkt nos está bloqueando: hay que parar y volver más tarde."""


class NotFound(Exception):
    pass


class PoliteClient:
    def __init__(self, min_delay: float, max_delay: float, batch: int, pause_minutes: float, max_requests: int,
                 use_browser: bool = True, browser_timeout: int = 900):
        self.use_browser = use_browser
        self.browser_timeout = browser_timeout
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.min_delay = min_delay
        self.max_delay = max(max_delay, min_delay)
        self.batch = batch
        self.pause_minutes = pause_minutes
        self.max_requests = max_requests
        self.requests_done = 0
        self._last = 0.0

    @property
    def budget_left(self) -> bool:
        return self.max_requests <= 0 or self.requests_done < self.max_requests

    def _wait_turn(self) -> None:
        # Descanso largo entre tandas
        if self.requests_done and self.batch > 0 and self.requests_done % self.batch == 0 and self.pause_minutes > 0:
            secs = self.pause_minutes * 60 * random.uniform(0.85, 1.15)
            print(f"  ... tanda de {self.batch} peticiones completada, descansando {secs / 60:.1f} min")
            time.sleep(secs)
        # Espera aleatoria entre peticiones
        target = random.uniform(self.min_delay, self.max_delay)
        elapsed = time.monotonic() - self._last
        if elapsed < target:
            time.sleep(target - elapsed)

    @staticmethod
    def _is_challenge(r: requests.Response) -> bool:
        low = r.text[:5000].lower()
        return (
            r.status_code in (202, 405)
            or "human verification" in low
            or "awswaf" in low
            or "challenge.js" in low
        )

    def _alert(self) -> None:
        print("\a", end="", flush=True)
        if sys.platform == "darwin":
            subprocess.Popen(
                ["osascript", "-e",
                 'display notification "Resuelve la verificación en la ventana de Chrome" '
                 'with title "Transfermarkt" sound name "Glass"'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )

    def solve_in_browser(self, url: str) -> None:
        """Abre `url` en un navegador visible, espera a que se supere la verificación
        y copia las cookies (aws-waf-token) y el User-Agent a la sesión de requests."""
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise Blocked("Verificación humana y Playwright no está instalado (pip install playwright).")

        print(f"  [Verificación] Abriendo el navegador en {url}")
        print(f"  [Verificación] Si aparece un captcha, resuélvelo. Espero hasta {self.browser_timeout // 60} min...")
        self._alert()
        with sync_playwright() as pw:
            kwargs = dict(headless=False, viewport={"width": 1200, "height": 850}, locale="en-US")
            try:
                ctx = pw.chromium.launch_persistent_context(str(BROWSER_PROFILE), channel="chrome", **kwargs)
            except Exception:
                ctx = pw.chromium.launch_persistent_context(str(BROWSER_PROFILE), **kwargs)
            try:
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=60000)
                except Exception:
                    pass
                deadline = time.monotonic() + self.browser_timeout
                solved = False
                while time.monotonic() < deadline:
                    try:
                        html = page.content().lower()
                    except Exception:
                        html = ""  # la página está navegando
                    challenge = "human verification" in html or "awswaf" in html or "challenge.js" in html
                    if html and not challenge and ("data-header" in html or "transfermarkt" in html):
                        solved = True
                        break
                    time.sleep(2)
                if not solved:
                    raise Blocked("No se resolvió la verificación a tiempo.")
                time.sleep(2)  # que se asienten las cookies
                ua = page.evaluate("navigator.userAgent")
                cookies = ctx.cookies()
            finally:
                ctx.close()

        self.session.headers["User-Agent"] = ua
        for c in cookies:
            if "transfermarkt" in c.get("domain", ""):
                self.session.cookies.set(c["name"], c["value"], domain=c["domain"], path=c.get("path", "/"))
        print("  [Verificación] Superada, continúo con el script.")

    def get_soup(self, url: str) -> BeautifulSoup:
        backoffs = [60, 180, 600]  # segundos ante 429/403/503
        attempt = 0
        browser_solves = 0
        while True:
            self._wait_turn()
            self._last = time.monotonic()
            self.requests_done += 1
            try:
                r = self.session.get(url, timeout=25)
            except requests.RequestException as e:
                if attempt >= len(backoffs):
                    raise
                attempt += 1
                print(f"  [Aviso] error de red ({e.__class__.__name__}), reintento en 30 s")
                time.sleep(30)
                continue

            if self._is_challenge(r):
                if not self.use_browser:
                    raise Blocked("Transfermarkt muestra la verificación humana (AWS WAF).")
                if browser_solves >= 2:
                    raise Blocked("La verificación sigue apareciendo tras resolverla en el navegador.")
                browser_solves += 1
                self.solve_in_browser(url)
                continue
            if r.status_code == 200:
                return BeautifulSoup(r.text, "html.parser")
            if r.status_code == 404:
                raise NotFound(url)
            if r.status_code in (403, 429, 503) and attempt < len(backoffs):
                wait = backoffs[attempt] * random.uniform(0.9, 1.2)
                attempt += 1
                print(f"  [Aviso] HTTP {r.status_code}, esperando {wait / 60:.1f} min antes de reintentar...")
                time.sleep(wait)
                continue
            if r.status_code in (403, 429, 503):
                raise Blocked(f"HTTP {r.status_code} persistente tras varios backoffs.")
            raise requests.HTTPError(f"HTTP {r.status_code} en {url}")


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def parse_club_family(soup: BeautifulSoup) -> List[Dict[str, str]]:
    """Extrae los equipos/filiales del desplegable `+` del header de un club."""
    header = soup.select_one("header.data-header") or soup
    seen_ids = set()
    family: List[Tuple[int, str, str]] = []

    for a in header.select('a[href*="/startseite/verein/"]'):
        href = a.get("href") or ""
        if "/sort/" in href or "/saison_id/" in href:
            continue
        m = re.search(r"/startseite/verein/(\d+)(?:$|\?|/?$)", href)
        if not m:
            continue
        cid = int(m.group(1))
        name = a.get_text(" ", strip=True) or (a.get("title") or "").strip()
        if not name or cid in seen_ids:
            continue
        seen_ids.add(cid)
        family.append((cid, name, f"{BASE}{href}" if href.startswith("/") else href))

    if not family:
        return []

    pais = ""
    estadio = ""
    flag_img = header.select_one(
        ".data-header__box--big img.flaggenrahmen, .data-header__club-info img.flaggenrahmen"
    )
    if flag_img and flag_img.get("title"):
        pais = flag_img["title"].strip()
    for li in header.select("li.data-header__label"):
        txt = li.get_text(" ", strip=True)
        low = txt.lower()
        if low.startswith("stadium:"):
            val = li.select_one(".data-header__content a, .data-header__content")
            if val:
                estadio = re.sub(r"\s+\d[\d.,]*\s*Seats.*$", "", val.get_text(" ", strip=True), flags=re.I).strip()
        elif not pais and low.startswith(("country:", "league level:")):
            img = li.select_one("img.flaggenrahmen")
            if img and img.get("title"):
                pais = img["title"].strip()

    # El primer elemento del desplegable es el club matriz (identidad)
    id_identidad, nombre_identidad, _ = family[0]
    return [
        {
            "id_identidad": str(id_identidad),
            "nombre_identidad": nombre_identidad,
            "tm_id_equipo": str(cid),
            "nombre_equipo": name,
            "pais": pais,
            "estadio": estadio,
            "url_transfermarkt": link,
        }
        for cid, name, link in family
    ]


def parse_league_club_ids(soup: BeautifulSoup) -> List[int]:
    ids: List[int] = []
    for a in soup.select('table.items a[href*="/startseite/verein/"]'):
        m = re.search(r"/startseite/verein/(\d+)", a.get("href") or "")
        if m:
            ids.append(int(m.group(1)))
    return list(dict.fromkeys(ids))


def discover_league_codes(client: PoliteClient, max_pages: int) -> List[str]:
    """Descubre códigos de competición en Europa, América, Asia y África."""
    codes: List[str] = []
    for reg in ["europa", "amerika", "asien", "afrika"]:
        for page in range(1, max_pages + 1):
            if not client.budget_left:
                return list(dict.fromkeys(codes))
            try:
                soup = client.get_soup(f"{BASE}/wettbewerbe/{reg}?page={page}")
            except NotFound:
                break
            found = [
                m.group(1)
                for a in soup.select('table.items a[href*="/startseite/wettbewerb/"]')
                if (m := re.search(r"/startseite/wettbewerb/([A-Za-z0-9]+)", a.get("href") or ""))
            ]
            new = [c for c in found if c not in codes]
            if not new:
                break
            codes.extend(new)
            print(f"  Catálogo {reg} página {page}: {len(new)} ligas")
    return list(dict.fromkeys(codes))


# ---------------------------------------------------------------------------
# Estado en el Excel
# ---------------------------------------------------------------------------

class State:
    def __init__(self, path: Path):
        self.path = path
        self.rows: List[Dict[str, str]] = []
        self.row_keys = set()
        self.queue: Dict[int, Dict[str, str]] = {}  # tm_id_club -> fila de la cola (orden de inserción)
        self.leagues: Dict[str, Dict[str, str]] = {}
        self.catalog_done = False
        if path.exists():
            self._load()

    @staticmethod
    def _read_sheet(wb, name: str) -> List[Dict[str, str]]:
        if name not in wb.sheetnames:
            return []
        it = wb[name].iter_rows(values_only=True)
        hdr = next(it, None)
        if not hdr:
            return []
        hdr = [str(h or "") for h in hdr]
        out = []
        for row in it:
            if not row or row[0] in (None, ""):
                continue
            out.append({hdr[j]: ("" if row[j] is None else str(row[j])) for j in range(min(len(hdr), len(row)))})
        return out

    def _load(self) -> None:
        wb = openpyxl.load_workbook(self.path, read_only=True, data_only=True)
        sheet_rows = SHEET_ROWS if SHEET_ROWS in wb.sheetnames else wb.sheetnames[0]
        for r in self._read_sheet(wb, sheet_rows):
            self.add_row(r)
        for q in self._read_sheet(wb, SHEET_QUEUE):
            if q.get("tm_id_club", "").isdigit():
                self.queue[int(q["tm_id_club"])] = {h: q.get(h, "") for h in QUEUE_HEADERS}
        for lg in self._read_sheet(wb, SHEET_LEAGUES):
            if lg.get("codigo") == "__catalogo__":
                self.catalog_done = lg.get("estado") == "ok"
            else:
                self.leagues[lg["codigo"]] = {h: lg.get(h, "") for h in LEAGUE_HEADERS}
        wb.close()

        # Excel antiguo sin hoja "Cola": los clubes ya presentes cuentan como hechos
        if not self.queue and self.rows:
            for r in self.rows:
                for key in ("tm_id_equipo", "id_identidad"):
                    if r.get(key, "").isdigit():
                        self.mark_done(int(r[key]), "ok", 0, r["id_identidad"], origen="excel_previo")

    def add_row(self, r: Dict[str, str]) -> None:
        key = (r.get("id_identidad", ""), r.get("tm_id_equipo", ""))
        if key[1] and key not in self.row_keys:
            self.row_keys.add(key)
            self.rows.append({h: r.get(h, "") for h in ROW_HEADERS})

    def enqueue(self, cid: int, origen: str) -> bool:
        if cid in self.queue:
            return False
        self.queue[cid] = {
            "tm_id_club": str(cid), "origen": origen, "estado": "pendiente",
            "n_equipos": "", "id_identidad": "", "intentos": "0", "actualizado": "",
        }
        return True

    def mark_done(self, cid: int, estado: str, n: int, id_identidad: str = "", origen: str = "") -> None:
        q = self.queue.get(cid)
        if q is None:
            self.enqueue(cid, origen or "familia")
            q = self.queue[cid]
        q.update({"estado": estado, "n_equipos": str(n), "id_identidad": id_identidad, "actualizado": _now()})

    def pending(self) -> List[int]:
        return [
            cid for cid, q in self.queue.items()
            if q["estado"] == "pendiente" or (q["estado"] == "error" and int(q["intentos"] or 0) < MAX_ATTEMPTS)
        ]

    def save(self) -> None:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = SHEET_ROWS
        ws.append(ROW_HEADERS)
        for r in self.rows:
            ws.append([r[h] for h in ROW_HEADERS])
        ws.freeze_panes = "A2"

        wq = wb.create_sheet(SHEET_QUEUE)
        wq.append(QUEUE_HEADERS)
        for q in self.queue.values():
            wq.append([q[h] for h in QUEUE_HEADERS])
        wq.freeze_panes = "A2"

        wl = wb.create_sheet(SHEET_LEAGUES)
        wl.append(LEAGUE_HEADERS)
        if self.catalog_done:
            wl.append(["__catalogo__", "ok", len(self.leagues), _now()])
        for lg in self.leagues.values():
            wl.append([lg[h] for h in LEAGUE_HEADERS])
        wl.freeze_panes = "A2"

        # Guardado atómico: si se corta a mitad, el Excel anterior sigue intacto
        tmp = self.path.with_name(self.path.stem + ".tmp.xlsx")
        wb.save(tmp)
        tmp.replace(self.path)

    def summary(self) -> str:
        counts: Dict[str, int] = {}
        for q in self.queue.values():
            counts[q["estado"]] = counts.get(q["estado"], 0) + 1
        lg_pend = sum(1 for lg in self.leagues.values() if lg["estado"] != "ok")
        parts = ", ".join(f"{k}: {v}" for k, v in sorted(counts.items())) or "cola vacía"
        return (f"{len(self.rows)} filas de identidad | clubes en cola → {parts} | "
                f"ligas: {len(self.leagues)} ({lg_pend} pendientes)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    p = argparse.ArgumentParser(description="Extraer identidades de club y filiales desde Transfermarkt (despacio y reanudable)")
    p.add_argument("--clubs", nargs="*", type=int, default=[], help="IDs de club en Transfermarkt (ej. 418 131)")
    p.add_argument("--leagues", nargs="*", default=[], help="Códigos de liga en Transfermarkt (ej. ES1 ES2)")
    p.add_argument("--all-leagues", action="store_true", help="Recorrer todo el catálogo de ligas de Transfermarkt")
    p.add_argument("--max-pages", type=int, default=10, help="Máximo de páginas por continente en el catálogo")
    p.add_argument("--min-delay", type=float, default=6.0, help="Segundos mínimos entre peticiones (def. 6)")
    p.add_argument("--max-delay", type=float, default=12.0, help="Segundos máximos entre peticiones (def. 12)")
    p.add_argument("--batch", type=int, default=40, help="Peticiones por tanda antes de un descanso largo (def. 40)")
    p.add_argument("--pause-minutes", type=float, default=8.0, help="Minutos de descanso entre tandas (def. 8)")
    p.add_argument("--max-requests", type=int, default=0, help="Tope de peticiones en esta ejecución (0 = sin tope)")
    p.add_argument("--save-every", type=int, default=10, help="Guardar el Excel cada N clubes (def. 10)")
    p.add_argument("--retry-errors", action="store_true", help="Volver a intentar clubes en 'error' aunque superen los intentos")
    p.add_argument("--no-browser", action="store_true", help="No abrir el navegador ante la verificación humana: guardar y parar")
    p.add_argument("--browser-timeout", type=int, default=15, help="Minutos máximos esperando a que resuelvas la verificación (def. 15)")
    p.add_argument("--status", action="store_true", help="Mostrar el estado del Excel y salir")
    p.add_argument("--out", default="tm_identidades.xlsx", help="Excel de salida y de estado (se reanuda si existe)")
    args = p.parse_args()

    state = State(Path(args.out))
    if args.status:
        print(state.summary())
        return

    if args.retry_errors:
        for q in state.queue.values():
            if q["estado"] == "error":
                q["intentos"] = "0"

    added = sum(state.enqueue(cid, "manual") for cid in args.clubs)
    for code in args.leagues:
        state.leagues.setdefault(code, {"codigo": code, "estado": "pendiente", "n_clubes": "", "actualizado": ""})

    if not state.queue and not state.leagues and not args.all_leagues:
        raise SystemExit("Indica al menos --clubs, --leagues o --all-leagues")

    client = PoliteClient(args.min_delay, args.max_delay, args.batch, args.pause_minutes, args.max_requests,
                          use_browser=not args.no_browser, browser_timeout=args.browser_timeout * 60)
    print(f"Estado inicial: {state.summary()}" + (f" (+{added} clubes manuales)" if added else ""))

    processed = 0
    try:
        # 1) Catálogo de ligas (una sola vez; queda marcado en la hoja "Ligas")
        if args.all_leagues and not state.catalog_done:
            codes = discover_league_codes(client, args.max_pages)
            for code in codes:
                state.leagues.setdefault(code, {"codigo": code, "estado": "pendiente", "n_clubes": "", "actualizado": ""})
            state.catalog_done = client.budget_left  # si se agotó el tope a medias, se repetirá
            print(f"Ligas en catálogo: {len(state.leagues)}")
            state.save()

        # 2) Ligas pendientes → clubes a la cola
        # Con --leagues/--clubs (sin --all-leagues) solo se trabaja sobre lo indicado
        only = bool(args.leagues or args.clubs) and not args.all_leagues
        only_leagues = set(args.leagues)
        only_clubs = set(args.clubs)
        if only:
            print(f"Modo acotado: solo ligas {sorted(only_leagues) or '-'} y clubes {sorted(only_clubs) or '-'}")

        for code, lg in state.leagues.items():
            if only and code not in only_leagues:
                continue
            if lg["estado"] == "ok":
                continue
            if not client.budget_left:
                break
            try:
                ids = parse_league_club_ids(client.get_soup(f"{BASE}/-/startseite/wettbewerb/{code}"))
                lg["estado"] = "ok"
            except NotFound:
                ids, lg["estado"] = [], "no_existe"
            new = sum(state.enqueue(cid, code) for cid in ids)
            lg.update({"n_clubes": str(len(ids)), "actualizado": _now()})
            print(f"Liga {code}: {len(ids)} clubes ({new} nuevos en cola)")
            state.save()

        # 3) Clubes pendientes
        pending = state.pending()
        if only:
            pending = [c for c in pending if c in only_clubs or state.queue[c]["origen"] in only_leagues]
        print(f"Clubes pendientes: {len(pending)}")
        for cid in pending:
            q = state.queue[cid]
            if q["estado"] not in ("pendiente", "error"):
                continue  # ya resuelto como parte de la familia de otro club
            if not client.budget_left:
                print(f"Tope de {args.max_requests} peticiones alcanzado. Relanza más tarde para continuar.")
                break
            try:
                fam = parse_club_family(client.get_soup(f"{BASE}/-/startseite/verein/{cid}"))
            except NotFound:
                state.mark_done(cid, "sin_datos", 0)
                print(f"Club {cid}: no existe (404)")
                continue
            except requests.RequestException as e:
                q["intentos"] = str(int(q["intentos"] or 0) + 1)
                state.mark_done(cid, "error", 0)
                print(f"Club {cid}: error ({e}); intento {q['intentos']}/{MAX_ATTEMPTS}")
                continue

            if not fam:
                state.mark_done(cid, "sin_datos", 0)
                print(f"Club {cid}: página sin desplegable de equipos")
            else:
                ident = fam[0]["id_identidad"]
                for r in fam:
                    state.add_row(r)
                    # Los demás equipos de la familia ya no hace falta pedirlos
                    other = int(r["tm_id_equipo"])
                    if other != cid and state.queue.get(other, {}).get("estado") in (None, "pendiente", "error"):
                        state.mark_done(other, "ok", len(fam), ident)
                state.mark_done(cid, "ok", len(fam), ident)
                print(f"Club {cid}: {len(fam)} equipos (identidad {ident} {fam[0]['nombre_identidad']})")

            processed += 1
            if processed % args.save_every == 0:
                state.save()

    except Blocked as e:
        print(f"\n[STOP] {e}\nSe guarda el progreso. Espera unas horas y relanza el mismo comando.")
    except KeyboardInterrupt:
        print("\nInterrumpido por el usuario. Guardando progreso...")
    finally:
        state.save()
        print(f"Peticiones hechas: {client.requests_done}. Estado: {state.summary()}")
        print(f"Excel: {Path(args.out).resolve()}")

    if not state.pending() and all(lg["estado"] != "pendiente" for lg in state.leagues.values()):
        print("¡Todos los clubes han sido procesados!")


if __name__ == "__main__":
    sys.exit(main())
