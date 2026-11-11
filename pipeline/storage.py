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
        self.client.storage.from_(bucket).upload(path, content, {"content-type": content_type, "upsert": "true"})
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


def competiciones_objetivo(store: "Store", solo_admin: bool = False) -> List[Dict[str, Any]]:
    """Ligas a descargar: las activadas en el panel de administración (`ingestion_targets`);
    si no hay ninguna (o no hay BD), las de config.py, salvo con `solo_admin` (entonces ninguna)."""
    from .config import COMPETITIONS_CONFIG
    if store.online:
        try:
            filas = store.select_all('ingestion_targets', '*', enabled=True)
        except Exception as e:
            logger.warning(f"No se pudo leer ingestion_targets, se usa config.py: {e}")
            filas = []
        if filas:
            # Primero las temporadas antiguas: la activa se procesa la última y queda como active_season_id
            filas.sort(key=lambda f: (f['competition_id'], f.get('is_active', False), f.get('season_name') or ''))
            # Id de la liga en FotMob (escudos): el del panel o, si no, el de config.py o mapa conocido
            fotmob_cfg = {c['id']: c.get('fotmob_id') for c in COMPETITIONS_CONFIG}
            # Ligas con ID FotMob verificado (el resto se indica en el panel de administración)
            LIGAS_FOTMOB = {
                '5k620c7y6dlbmcm88dt3eb7t': 9907,  # Liga F (España)
            }
            return [{'id': f['competition_id'], 'name': f['competition_name'], 'country': f['country'],
                     'season_id': f['season_id'],
                     'fotmob_id': f.get('fotmob_id') or fotmob_cfg.get(f['competition_id']) or LIGAS_FOTMOB.get(f['competition_id']),
                     'active': f.get('is_active', False), 'fuente': f.get('fuente') or 'eventing'} for f in filas]
    return [] if solo_admin and store.online else COMPETITIONS_CONFIG


def dorsales_actuales(store: "Store", comps: List[Dict[str, Any]]) -> Dict[str, int]:
    """{player_id: dorsal} de las jugadoras activas en la plantilla de la temporada actual de cada liga.
    Para emparejar con FotMob/Soccerdonna (que muestran el dorsal de hoy) no vale el de otra temporada."""
    actuales = {c['season_id'] for c in comps if c.get('active')}
    if not actuales:
        return {}
    return {r['player_id']: r['shirt_number']
            for r in store.select_all('squad_members', 'player_id,season_id,active,shirt_number')
            if r['season_id'] in actuales and r.get('active') and r.get('shirt_number') is not None}
