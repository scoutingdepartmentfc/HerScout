#!/usr/bin/env python3
"""
pipeline/fm_fisico.py
Importa los atributos FÍSICOS de Football Manager (escala 1-20) de una exportación de vuestra propia partida
y los asigna a las jugadoras descargadas de Soccerdonna (public.player_physical).

Cómo exportar desde FM:
  1. Busca las jugadoras (Búsqueda de jugadores / plantillas) y crea una vista con: Nombre, Club, Fecha de
     nacimiento (o Edad) y los 8 atributos físicos: Aceleración, Agilidad, Equilibrio, Alcance de salto,
     Forma física natural, Velocidad, Resistencia y Fuerza.
  2. Selecciona todas las filas (Ctrl/Cmd+A) → Ctrl/Cmd+P → "Página web" (o "Archivo de texto").
  Formatos admitidos: .html (Página web), .txt (Archivo de texto, columnas con "|") y .csv/.tsv.
  Cabeceras en inglés o español, completas o abreviadas (Acc/Ace, Agi, Bal/Equ, Jum/Alc, Nat/For, Pac/Vel,
  Sta/Res, Str/Fue). Valores con rango ("12-14", atributos sin ojear del todo) → media.

Emparejamiento con cada jugadora de Soccerdonna (players.sd_url no nulo):
  - misma fecha de nacimiento y nombre parecido (>= 70), o
  - nombre casi igual (>= 92) y además mismo club o edad compatible (±1), o único candidato así.
  Las filas sin pareja se guardan en un CSV de revisión (.cache/fm_fisico_sin_pareja.csv).

Uso:  python -m pipeline.fm_fisico exportacion.html [otra.html ...] [--dry-run] [--todas]
      --todas: emparejar también con jugadoras sin ficha de Soccerdonna
"""

import argparse
import csv
import io
import logging
import os
import re
import sys
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from rapidfuzz import fuzz

from .config import LOCAL_CACHE_DIR
from .photos import misma_fecha, normalizar, normalizar_club, sim_nombre
from .storage import Store, get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("fm_fisico")

ATRIBUTOS = ["acceleration", "agility", "balance", "jumping_reach", "natural_fitness", "pace", "stamina", "strength"]

# Cabecera normalizada → columna (EN/ES, completa y abreviada)
CABECERAS = {
    "acceleration": "acceleration", "acc": "acceleration", "aceleracion": "acceleration", "ace": "acceleration",
    "agility": "agility", "agi": "agility", "agilidad": "agility",
    "balance": "balance", "bal": "balance", "equilibrio": "balance", "equ": "balance",
    "jumping reach": "jumping_reach", "jumping": "jumping_reach", "jum": "jumping_reach",
    "alcance de salto": "jumping_reach", "alc": "jumping_reach", "salto": "jumping_reach",
    # "Nat" en FM inglés es Natural Fitness o Nationality: se decide por el contenido (ver _resolver_nat)
    "natural fitness": "natural_fitness", "nat": "_nat", "forma fisica natural": "natural_fitness",
    "for": "natural_fitness", "ffn": "natural_fitness",
    "pace": "pace", "pac": "pace", "velocidad": "pace", "vel": "pace",
    "stamina": "stamina", "sta": "stamina", "resistencia": "stamina", "res": "stamina",
    "strength": "strength", "str": "strength", "fuerza": "strength", "fue": "strength",
    "name": "_name", "nombre": "_name", "player": "_name", "jugador": "_name", "jugadora": "_name",
    "club": "_club", "team": "_club", "equipo": "_club",
    "dob": "_dob", "date of birth": "_dob", "fecha de nacimiento": "_dob", "nacimiento": "_dob", "fdn": "_dob",
    "age": "_age", "edad": "_age",
    "nationality": "_nation", "nacionalidad": "_nation",
}


class _Tablas(HTMLParser):
    """Extrae las filas (listas de celdas de texto) de todas las tablas de un HTML."""

    def __init__(self):
        super().__init__()
        self.filas: List[List[str]] = []
        self._fila: Optional[List[str]] = None
        self._celda: Optional[List[str]] = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._fila = []
        elif tag in ("td", "th") and self._fila is not None:
            self._celda = []

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._fila is not None and self._celda is not None:
            self._fila.append(re.sub(r"\s+", " ", "".join(self._celda)).strip())
            self._celda = None
        elif tag == "tr" and self._fila is not None:
            if any(self._fila):
                self.filas.append(self._fila)
            self._fila = None

    def handle_data(self, data):
        if self._celda is not None:
            self._celda.append(data)


def _leer_filas(ruta: Path) -> List[List[str]]:
    raw = ruta.read_bytes()
    for enc in ("utf-8-sig", "utf-16", "cp1252"):
        try:
            texto = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        texto = raw.decode("utf-8", errors="replace")
    if "<tr" in texto.lower():
        p = _Tablas()
        p.feed(texto)
        return p.filas
    lineas = [l for l in texto.splitlines() if l.strip() and not set(l.strip()) <= set("-|+ ")]
    if lineas and lineas[0].count("|") >= 3:  # "Archivo de texto" de FM
        return [[c.strip() for c in l.strip().strip("|").split("|")] for l in lineas]
    dialecto = "excel-tab" if "\t" in (lineas[0] if lineas else "") else "excel"
    if dialecto == "excel" and lineas and lineas[0].count(";") > lineas[0].count(","):
        return [r for r in csv.reader(io.StringIO("\n".join(lineas)), delimiter=";")]
    return [r for r in csv.reader(io.StringIO("\n".join(lineas)), dialect=dialecto)]


def _columnas(cabecera: List[str]) -> Dict[int, str]:
    cols = {}
    for i, h in enumerate(cabecera):
        clave = CABECERAS.get(normalizar(h))
        if clave and (clave == "_nat" or clave not in cols.values()):
            cols[i] = clave
    return cols


def _resolver_nat(cols: Dict[int, str], datos: List[List[str]]) -> Dict[int, str]:
    """Columnas "Nat": la que tiene números 1-20 es Natural Fitness; el resto, nacionalidad."""
    out = dict(cols)
    for i, clave in cols.items():
        if clave != "_nat":
            continue
        valores = [f[i] for f in datos[:30] if i < len(f) and re.search(r"[A-Za-z0-9]", f[i])]
        numericos = sum(_valor(v) is not None and not re.search(r"[a-zA-Z]", v) for v in valores)
        es_ff = valores and numericos >= len(valores) * 0.8 and "natural_fitness" not in out.values()
        out[i] = "natural_fitness" if es_ff else "_nation"
    return out


def _valor(txt: str) -> Optional[float]:
    """'14' → 14; '12-14' → 13; '-' o vacío → None. Escala FM 1-20."""
    nums = [float(n) for n in re.findall(r"\d+(?:[.,]\d+)?", (txt or "").replace(",", "."))]
    nums = [n for n in nums if 1 <= n <= 20]
    return round(sum(nums) / len(nums), 1) if nums else None


def _fecha(txt: str) -> Optional[str]:
    m = re.search(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", txt or "")
    if m:
        d, mth, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(y, mth, d).isoformat()
        except ValueError:
            try:
                return date(y, d, mth).isoformat()  # formato mm/dd/yyyy
            except ValueError:
                return None
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", txt or "")
    return m.group(0) if m else None


def leer_exportacion(ruta: Path) -> List[Dict[str, Any]]:
    """Filas de jugadoras con sus atributos físicos (1-20) y datos para emparejar."""
    filas = _leer_filas(ruta)
    # La cabecera es la primera fila que tenga nombre y al menos 4 atributos físicos
    for k, fila in enumerate(filas):
        cabecera = _columnas(fila)
        cols = _resolver_nat(cabecera, filas[k + 1:])
        if "_name" in cols.values() and sum(c in ATRIBUTOS for c in cols.values()) >= 4:
            break
    else:
        raise ValueError(f"{ruta.name}: no encuentro una cabecera con Nombre y los atributos físicos")
    faltan = [a for a in ATRIBUTOS if a not in cols.values()]
    if faltan:
        logger.warning(f"{ruta.name}: faltan columnas {faltan} (se quedan vacías)")
    out = []
    for fila in filas[k + 1:]:
        if _columnas(fila) == cabecera:  # cabecera repetida (exportaciones paginadas)
            continue
        d = {clave: (fila[i] if i < len(fila) else "") for i, clave in cols.items()}
        if not d.get("_name"):
            continue
        attrs = {a: _valor(d.get(a, "")) for a in ATRIBUTOS}
        if all(v is None for v in attrs.values()):
            continue
        edad = re.search(r"\d+", d.get("_age", "") or "")
        out.append({
            "fm_name": re.sub(r"\s*\(.*?\)\s*$", "", d["_name"]).strip(),
            "fm_club": d.get("_club") or None,
            "fm_birth_date": _fecha(d.get("_dob", "")),
            "fm_age": int(edad.group(0)) if edad else None,
            **attrs,
        })
    return out


def _edad(nacimiento: Optional[str]) -> Optional[int]:
    if not nacimiento:
        return None
    try:
        n = date.fromisoformat(str(nacimiento)[:10])
    except ValueError:
        return None
    hoy = date.today()
    return hoy.year - n.year - ((hoy.month, hoy.day) < (n.month, n.day))


def emparejar(fila: Dict[str, Any], jugadoras: List[Dict[str, Any]],
              por_fecha: Dict[str, List[Dict[str, Any]]]) -> Tuple[Optional[Dict[str, Any]], float, str]:
    """(jugadora, parecido de nombre, método) o (None, mejor parecido, motivo)."""
    nombre = fila["fm_name"]
    if fila.get("fm_birth_date"):
        mismas = [(sim_nombre(j, nombre), j) for j in por_fecha.get(fila["fm_birth_date"], [])]
        mismas = sorted((x for x in mismas if x[0] >= 70), key=lambda x: -x[0])
        if mismas:
            return mismas[0][1], mismas[0][0], "fecha+nombre"

    club = normalizar_club(fila.get("fm_club"))
    casi = sorted(((sim_nombre(j, nombre), j) for j in jugadoras), key=lambda x: -x[0])
    # Con fecha en las dos fichas y distinta no es la misma jugadora aunque el nombre encaje
    # (token_set_ratio da 100 si solo coincide el nombre de pila: "Ainhoa Alguacil" vs "Ainhoa Doménech")
    fecha = fila.get("fm_birth_date")
    buenos = [(s, j) for s, j in casi if s >= 92
              and not (fecha and j.get("birth_date") and not misma_fecha(fecha, str(j["birth_date"])[:10]))]
    for s, j in buenos:
        clubs_j = [normalizar_club(j.get("fm_team_name")), normalizar_club((j.get("teams") or {}).get("name"))]
        if club and any(c and fuzz.token_set_ratio(club, c) >= 85 for c in clubs_j):
            return j, s, "nombre+club"
        edad_fm = fila.get("fm_age") or _edad(fila.get("fm_birth_date"))
        edad_j = _edad(j.get("birth_date"))
        if edad_fm and edad_j and abs(edad_fm - edad_j) <= 1:
            return j, s, "nombre+edad"
    if len(buenos) == 1 and not fila.get("fm_birth_date"):
        return buenos[0][1], buenos[0][0], "nombre-unico"
    return None, (casi[0][0] if casi else 0), "sin pareja"


def main():
    parser = argparse.ArgumentParser(description="Importa los atributos físicos de una exportación de Football Manager")
    parser.add_argument("ficheros", nargs="+", help="Exportaciones de FM (.html, .txt, .csv)")
    parser.add_argument("--dry-run", action="store_true", help="Solo emparejar y mostrar el resultado, sin guardar")
    parser.add_argument("--todas", action="store_true", help="Incluir jugadoras sin ficha de Soccerdonna")
    args = parser.parse_args()

    filas: List[Dict[str, Any]] = []
    for f in args.ficheros:
        ruta = Path(f)
        leidas = leer_exportacion(ruta)
        for r in leidas:
            r["source_file"] = ruta.name
        logger.info(f"{ruta.name}: {len(leidas)} jugadoras con atributos físicos")
        filas += leidas
    if not filas:
        logger.error("No hay filas que importar")
        sys.exit(1)

    store = Store(get_supabase_client())
    query = store.client.table("players").select(
        "id, name, first_name, last_name, match_name, birth_date, fm_team_name, sd_url, teams ( name )")
    jugadoras, desde = [], 0
    while True:
        q = query if args.todas else query.not_.is_("sd_url", "null")
        lote = q.range(desde, desde + 999).execute().data or []
        jugadoras += lote
        if len(lote) < 1000:
            break
        desde += 1000
    logger.info(f"Jugadoras candidatas: {len(jugadoras)} ({'todas' if args.todas else 'con Soccerdonna'})")
    por_fecha: Dict[str, List[Dict[str, Any]]] = {}
    for j in jugadoras:
        if j.get("birth_date"):
            por_fecha.setdefault(str(j["birth_date"])[:10], []).append(j)

    ahora = datetime.now(timezone.utc).isoformat()
    elegidas: Dict[str, Dict[str, Any]] = {}
    sin_pareja = []
    for fila in filas:
        j, score, metodo = emparejar(fila, jugadoras, por_fecha)
        if not j:
            sin_pareja.append({**fila, "mejor_parecido": round(score)})
            continue
        previa = elegidas.get(j["id"])
        if previa and previa["match_score"] >= score:
            continue
        elegidas[j["id"]] = {"player_id": j["id"], **{k: fila[k] for k in ATRIBUTOS},
                             "fm_name": fila["fm_name"], "fm_club": fila["fm_club"],
                             "fm_birth_date": fila["fm_birth_date"], "match_method": metodo,
                             "match_score": round(score, 1), "source_file": fila["source_file"], "updated_at": ahora,
                             "_jugadora": j["name"]}

    for r in sorted(elegidas.values(), key=lambda r: r["_jugadora"])[:15]:
        logger.info(f"  {r['fm_name']!r} → {r['_jugadora']!r} ({r['match_method']}, {r['match_score']})")
    logger.info(f"Emparejadas: {len(elegidas)} · sin pareja: {len(sin_pareja)}")

    if sin_pareja:
        os.makedirs(LOCAL_CACHE_DIR, exist_ok=True)
        ruta = Path(LOCAL_CACHE_DIR) / "fm_fisico_sin_pareja.csv"
        with ruta.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(sin_pareja[0].keys()))
            w.writeheader()
            w.writerows(sin_pareja)
        logger.info(f"Revisa las filas sin pareja en {ruta}")

    if args.dry_run:
        logger.info("--dry-run: no se guarda nada")
        return
    store.upsert("player_physical", [{k: v for k, v in r.items() if k != "_jugadora"} for r in elegidas.values()],
                 on_conflict="player_id")
    logger.info(f"✓ Guardados los atributos físicos de {len(elegidas)} jugadoras")


if __name__ == "__main__":
    main()
