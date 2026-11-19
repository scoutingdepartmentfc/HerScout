"""
pipeline/storage.py
Acceso a Supabase (Postgres + Storage) para el pipeline:
- upserts por lotes con reintentos
- caché de métricas brutas partido a partido en Storage (parquet por temporada), que es la
  fuente para la agregación y para saber qué partidos ya están procesados. Así la base de
  datos (500 MB en el plan Free) solo guarda columnas nativas, scores y agregados.
- subida de imágenes (fotos de jugadores y escudos) a buckets públicos
"""

import io
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import pandas as pd

from .config import BUCKET_PIPELINE_CACHE, BUCKET_PLAYER_PHOTOS, BUCKET_TEAM_BADGES, LOCAL_CACHE_DIR

try:
    from dotenv import load_dotenv
    # HerScout guarda las claves en .env.local (Next.js); .env sigue valiendo para el pipeline suelto
    load_dotenv(Path(__file__).parent.parent / '.env')
    load_dotenv(Path(__file__).parent.parent / '.env.local')
except ImportError:
    pass

logger = logging.getLogger(__name__)

PUBLIC_BUCKETS = {BUCKET_PLAYER_PHOTOS, BUCKET_TEAM_BADGES}


def _limpiar_env(valor: Optional[str], nombre: str) -> Optional[str]:
    """Valor de un secret pegado a mano: sin espacios ni saltos de línea, sin comillas y sin 'NOMBRE=' delante
    (errores típicos al copiarlo de .env.local a GitHub → Settings → Secrets)."""
    if not valor:
        return valor
    v = valor.strip()
    v = re.sub(rf"^(export\s+)?[A-Z_]*{nombre}\s*=\s*", "", v)
    return v.strip().strip("'\"").strip()


def get_supabase_client():
    from supabase import create_client
    url = _limpiar_env(os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
                       or os.environ.get("VITE_SUPABASE_URL"), "SUPABASE_URL")
    key = _limpiar_env(os.environ.get("SUPABASE_SERVICE_ROLE_KEY"), "SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError(
            "Se requieren SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY. "
            "La anon key no sirve: RLS solo permite escribir al service_role."
        )
    if re.fullmatch(r"[a-z0-9]{20}", url):  # solo el id del proyecto
        url = f"https://{url}.supabase.co"
    url = url.rstrip("/")
    if not re.match(r"^https?://[^\s/]+", url):
        # Sin mostrar el valor (en GitHub es un secret): solo qué forma tiene
        raise ValueError(
            f"SUPABASE_URL no es una URL válida ({len(url)} caracteres, empieza por {url[:8]!r}…). "
            "Debe ser https://<proyecto>.supabase.co, sin comillas ni espacios.")
    return create_client(url, key)


class Store:
    """Envoltorio de Supabase. Con client=None trabaja en local (dry-run): no escribe en BD."""

    def __init__(self, client=None):
        self.client = client
        self._buckets_ok = set()

    @property
    def online(self) -> bool:
        return self.client is not None

    # ── Postgres ────────────────────────────────────────────
    def upsert(self, table: str, rows: List[Dict[str, Any]], on_conflict: Optional[str] = None, batch: int = 500):
        if not self.client or not rows:
            return
        for i in range(0, len(rows), batch):
            self._upsert_lote(table, rows[i:i + batch], on_conflict)

    def _upsert_lote(self, table: str, chunk: List[Dict[str, Any]], on_conflict: Optional[str]):
        for attempt in range(3):
            try:
                q = self.client.table(table).upsert(chunk, on_conflict=on_conflict) if on_conflict \
                    else self.client.table(table).upsert(chunk)
                q.execute()
                return
            except Exception as e:
                # Statement timeout (57014): lote demasiado pesado → se parte en dos en vez de reintentar igual
                if '57014' in str(e) and len(chunk) > 1:
                    mitad = len(chunk) // 2
                    logger.warning(f"Timeout en upsert de {table}: lote de {len(chunk)} partido en dos")
                    self._upsert_lote(table, chunk[:mitad], on_conflict)
                    self._upsert_lote(table, chunk[mitad:], on_conflict)
                    return
                if attempt == 2:
                    raise
                logger.warning(f"Reintentando upsert en {table} ({e})")
                time.sleep(2 * (attempt + 1))

    def insert(self, table: str, row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self.client:
            return None
        res = self.client.table(table).insert(row).execute()
        return res.data[0] if res.data else None

    def update(self, table: str, values: Dict[str, Any], **eq):
        if not self.client:
            return
        q = self.client.table(table).update(values)
        for k, v in eq.items():
            q = q.eq(k, v)
        q.execute()

    def delete(self, table: str, **eq):
        if not self.client:
            return
        q = self.client.table(table).delete()
        for k, v in eq.items():
            q = q.eq(k, v)
        q.execute()

    def delete_in(self, table: str, column: str, values: List[Any], batch: int = 100):
        if not self.client:
            return
        for chunk in chunked(values, batch):
            self.client.table(table).delete().in_(column, chunk).execute()

    def select_all(self, table: str, columns: str, page: int = 1000, **eq) -> List[Dict[str, Any]]:
        """SELECT paginado (PostgREST limita a 1000 filas por petición)."""
        if not self.client:
            return []
        out, start = [], 0
        while True:
            q = self.client.table(table).select(columns)
            for k, v in eq.items():
                q = q.eq(k, v)
            data = q.range(start, start + page - 1).execute().data or []
            out.extend(data)
            if len(data) < page:
                return out
            start += page

    # ── Storage ─────────────────────────────────────────────
    def ensure_bucket(self, bucket: str):
        if not self.client or bucket in self._buckets_ok:
            return
        try:
            self.client.storage.get_bucket(bucket)
        except Exception:
            try:
                self.client.storage.create_bucket(bucket, options={"public": bucket in PUBLIC_BUCKETS})
                logger.info(f"Bucket '{bucket}' creado")
            except Exception as e:
                logger.debug(f"create_bucket {bucket}: {e}")
        self._buckets_ok.add(bucket)

    def upload(self, bucket: str, path: str, content: bytes, content_type: str) -> Optional[str]:
        """Sube (sobrescribe) un fichero y devuelve su URL pública si el bucket es público."""
        if not self.client:
            return None
        self.ensure_bucket(bucket)
        opts = {"content-type": content_type, "upsert": "true"}
        if bucket in PUBLIC_BUCKETS:
            # Fotos y escudos: el navegador/CDN los reutiliza 7 días en vez de 1 h (por defecto) → mucho menos egress.
            # No más: algunas rutas se sobrescriben sin ?v= en la URL y tardarían en verse.
            opts["cache-control"] = "604800"
        self.client.storage.from_(bucket).upload(path, content, opts)
        return self.client.storage.from_(bucket).get_public_url(path) if bucket in PUBLIC_BUCKETS else None

    def download(self, bucket: str, path: str) -> Optional[bytes]:
        if not self.client:
            return None
        try:
            return self.client.storage.from_(bucket).download(path)
        except Exception as e:
            # Solo "no existe" equivale a vacío; un fallo transitorio no debe hacer creer que no hay
            # caché (se sobrescribiría con un subconjunto de partidos)
            if "not found" in str(e).lower() or "404" in str(e):
                return None
            raise

    # ── Caché de métricas por partido ───────────────────────
    def _cache_path(self, season_id: str) -> str:
        return f"metricas_partidos/{season_id}.parquet"

    def load_match_cache(self, season_id: str) -> pd.DataFrame:
        """Online: solo Storage (lo procesado en un dry-run local no debe saltarse en BD). Offline: disco."""
        if self.client:
            raw = self.download(BUCKET_PIPELINE_CACHE, self._cache_path(season_id))
            return pd.read_parquet(io.BytesIO(raw)) if raw else pd.DataFrame()
        local = Path(LOCAL_CACHE_DIR) / self._cache_path(season_id)
        return pd.read_parquet(local) if local.exists() else pd.DataFrame()

    def save_match_cache(self, season_id: str, df: pd.DataFrame):
        buf = io.BytesIO()
        df.to_parquet(buf, index=False, compression="zstd")
        if self.client:
            self.upload(BUCKET_PIPELINE_CACHE, self._cache_path(season_id), buf.getvalue(), "application/octet-stream")
        else:
            local = Path(LOCAL_CACHE_DIR) / self._cache_path(season_id)
            local.parent.mkdir(parents=True, exist_ok=True)
            local.write_bytes(buf.getvalue())


def chunked(items: Iterable, size: int):
    items = list(items)
    for i in range(0, len(items), size):
        yield items[i:i + size]


def competiciones_objetivo(store: "Store", solo_admin: bool = False, liga_code: Optional[str] = None,
                           solo_ultima: bool = False) -> List[Dict[str, Any]]:
    """Temporadas Opta a descargar, según las ligas de /admin (`sd_leagues`): su `opta_competition_id` y las
    temporadas elegidas (`opta_season_ids`) más la última del catálogo Opta (así una temporada nueva entra sola).
    `liga_code`: solo esa liga de Soccerdonna (aunque no esté activada). `solo_ultima`: la temporada más reciente
    y las elegidas que aún no se han descargado nunca (las antiguas ya descargadas no cambian).
    Orden: de la más antigua a la más reciente; solo la última de cada competición va con `active`.
    Sin ligas (o sin BD): las de config.py, salvo con `solo_admin` (entonces ninguna)."""
    from .config import COMPETITIONS_CONFIG
    if not store.online:
        return COMPETITIONS_CONFIG
    try:
        ligas = [l for l in store.select_all('sd_leagues', 'code,enabled,opta_competition_id,opta_season_ids')
                 if l.get('opta_competition_id') and (l['code'] == liga_code if liga_code else l.get('enabled'))]
        catalogo = store.select_all('opta_catalog', 'season_id,competition_id,competition_name,country,season_name,'
                                                    'start_date,has_eventing,data_level') if ligas else []
    except Exception as e:
        logger.warning(f"No se pudieron leer las ligas de /admin (sd_leagues): {e}")
        ligas, catalogo = [], []
    if not ligas:
        return [] if solo_admin else COMPETITIONS_CONFIG
    por_temporada = {c['season_id']: c for c in catalogo}
    elegidas: Dict[str, set] = {}
    for l in ligas:  # varias ligas de Soccerdonna pueden apuntar a la misma competición Opta
        elegidas.setdefault(str(l['opta_competition_id']).strip(), set()).update(l.get('opta_season_ids') or [])
    ultima: Dict[str, Dict[str, Any]] = {}
    for c in catalogo:
        if c['competition_id'] in elegidas and (c.get('data_level') or '').startswith('jugadora') \
                and (c.get('start_date') or '') > (ultima.get(c['competition_id'], {}).get('start_date') or ''):
            ultima[c['competition_id']] = c
    # Descargada = con estadísticas guardadas. La fila de `seasons` no vale: se crea al EMPEZAR a procesarla, así
    # que una descarga cortada (timeout, error) dejaba la temporada vacía y marcada como hecha para siempre
    descargadas = {s['season_id'] for s in store.select_all('player_season_stats', 'season_id')} \
        if solo_ultima else set()
    # Id de la liga en FotMob (escudos y fotos): el guardado en competitions o, si no, el de config.py
    fotmob = {c['id']: c.get('fotmob_id') for c in COMPETITIONS_CONFIG}
    fotmob.update({c['id']: c['fotmob_id'] for c in store.select_all('competitions', 'id,fotmob_id') if c.get('fotmob_id')})
    salida = []
    for cid, sids in elegidas.items():
        sids = {s for s in sids if s in por_temporada}
        if cid in ultima:
            sids.add(ultima[cid]['season_id'])
        if not sids:
            logger.warning(f"Opta {cid}: sin temporadas en el catálogo (python -m pipeline.catalogo)")
            continue
        orden = sorted(sids, key=lambda s: por_temporada[s].get('start_date') or '')
        if solo_ultima:
            orden = [s for s in orden[:-1] if s not in descargadas] + orden[-1:]
        for sid in orden:
            c = por_temporada[sid]
            salida.append({'id': cid, 'name': c['competition_name'], 'country': c.get('country'), 'season_id': sid,
                           'season_name': c.get('season_name'), 'fotmob_id': fotmob.get(cid),
                           'has_eventing': bool(c.get('has_eventing')), 'active': sid == orden[-1],
                           'fuente': 'eventing' if c.get('has_eventing') else 'matchstats'})
    return salida


def competiciones_calendario(store: "Store", liga_code: Optional[str] = None) -> List[Dict[str, Any]]:
    """Ligas de /admin cuya competición Opta NO tiene datos por jugadora en ninguna temporada (solo resultados o
    alineaciones, p. ej. Dinamarca): su temporada más reciente, para guardar el calendario (horarios y resultados)
    sin notas. Las que sí tienen datos por jugadora van por competiciones_objetivo."""
    if not store.online:
        return []
    ligas = [l for l in store.select_all('sd_leagues', 'code,enabled,opta_competition_id')
             if l.get('opta_competition_id') and (l['code'] == liga_code if liga_code else l.get('enabled'))]
    cids = {str(l['opta_competition_id']).strip() for l in ligas}
    if not cids:
        return []
    por_comp: Dict[str, List[Dict[str, Any]]] = {}
    for c in store.select_all('opta_catalog', 'season_id,competition_id,competition_name,country,season_name,'
                                              'start_date,data_level'):
        if c['competition_id'] in cids:
            por_comp.setdefault(c['competition_id'], []).append(c)
    salida = []
    for cid, temporadas in por_comp.items():
        if any((t.get('data_level') or '').startswith('jugadora') for t in temporadas):
            continue
        c = max(temporadas, key=lambda t: t.get('start_date') or '')
        salida.append({'id': cid, 'name': c['competition_name'], 'country': c.get('country'), 'season_id': c['season_id'],
                       'season_name': c.get('season_name'), 'active': True, 'solo_calendario': True})
    return salida


def dorsales_actuales(store: "Store", comps: List[Dict[str, Any]]) -> Dict[str, int]:
    """{player_id: dorsal} de las jugadoras activas en la plantilla de la temporada actual de cada liga.
    Para emparejar con FotMob/Soccerdonna (que muestran el dorsal de hoy) no vale el de otra temporada."""
    actuales = {c['season_id'] for c in comps if c.get('active')}
    if not actuales:
        return {}
    return {r['player_id']: r['shirt_number']
            for r in store.select_all('squad_members', 'player_id,season_id,active,shirt_number')
            if r['season_id'] in actuales and r.get('active') and r.get('shirt_number') is not None}
