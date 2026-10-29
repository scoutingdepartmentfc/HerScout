"""
pipeline/adapter.py
Adaptador desacoplado para el proveedor de datos de fútbol (Opta / Performfeeds SDAPI).
Permite sustituir o cambiar la API sin afectar a las métricas ni a la base de datos.

Feeds utilizados (clave pública de widgets):
- match       → calendario y resultados de la temporada (paginado)
- squads      → plantillas con datos personales (altura, peso, pie, dorsal...)
- matchevent  → eventos con coordenadas y qualifiers (incluye "Team set up" y cambios)
- matchstats  → alineaciones con minutos, formación, capitán y estadísticas oficiales Opta
"""

import json
import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional

import requests

from .config import DEFAULT_OUTLET_KEY, SDAPI_BASE_URL

logger = logging.getLogger(__name__)

PAGE_SIZE = 400


class FootballProviderAdapter:
    """Interfaz base para adaptadores de proveedores de datos."""
    def get_fixtures(self, season_id: str) -> List[Dict[str, Any]]:
        raise NotImplementedError

    def get_squads(self, season_id: str) -> List[Dict[str, Any]]:
        raise NotImplementedError

    def get_match_events(self, match_id: str) -> Optional[Dict[str, Any]]:
        raise NotImplementedError

    def get_match_stats(self, match_id: str) -> Optional[Dict[str, Any]]:
        raise NotImplementedError


class OptaSDAPIAdapter(FootballProviderAdapter):
    """
    Implementación concreta para la API Performfeeds / Opta SDAPI (JSONP).
    Gestiona reintentos exponenciales, limpieza JSONP y headers seguros.
    Es segura para usarse desde varios hilos (una sesión HTTP por hilo).
    """
    def __init__(self, outlet_key: Optional[str] = None):
        self.outlet_key = outlet_key or os.environ.get('SDAPI_OUTLET_KEY') or DEFAULT_OUTLET_KEY
        self.base_url = SDAPI_BASE_URL
        self._local = threading.local()

    @property
    def session(self) -> requests.Session:
        if not hasattr(self._local, "session"):
            s = requests.Session()
            s.headers.update({
                'Referer': 'https://www.scoresway.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            })
            self._local.session = s
        return self._local.session

    def _parse_jsonp(self, text: str) -> Optional[Dict[str, Any]]:
        start = text.find('{')
        end = text.rfind('}')
        if start == -1 or end == -1:
            return None
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError as e:
            logger.error(f"Error decodificando JSONP: {e}")
            return None

    def _get(self, url: str, retries: int = 4, timeout: int = 30) -> Optional[Dict[str, Any]]:
        last_error = None
        for attempt in range(retries):
            try:
                resp = self.session.get(url, timeout=timeout)
                if resp.status_code == 200:
                    data = self._parse_jsonp(resp.text)
                    if data is None:
                        last_error = "respuesta vacía o no JSON"
                    elif 'errorCode' in data:
                        # La API devuelve 200 con {"errorCode": ...} cuando el feed no existe para ese recurso
                        logger.debug(f"API errorCode {data.get('errorCode')} en {url}")
                        return None
                    else:
                        return data
                elif resp.status_code in (429, 500, 502, 503, 504):
                    last_error = f"HTTP {resp.status_code}"
                    logger.warning(f"Respuesta {resp.status_code} de la API. Reintentando...")
                else:
                    logger.error(f"Error HTTP {resp.status_code} al solicitar {url}")
                    return None
            except requests.RequestException as e:
                last_error = e
                logger.warning(f"Fallo de conexión intento {attempt + 1}/{retries}: {e}")
            time.sleep(2 ** attempt)
        logger.error(f"Agotados reintentos para {url}. Último error: {last_error}")
        return None

    def get_fixtures(self, season_id: str) -> List[Dict[str, Any]]:
        """Descarga todos los partidos de la temporada (paginando: hay ligas con >400 partidos)."""
        matches: List[Dict[str, Any]] = []
        page = 1
        while True:
            url = (
                f"{self.base_url}/match/{self.outlet_key}/"
                f"?_fmt=jsonp&_rt=c&tmcl={season_id}&live=yes&_pgSz={PAGE_SIZE}&_pgNm={page}&_lcl=en"
                f"&sps=widgets&_clbk=callback"
            )
            data = self._get(url)
            chunk = (data or {}).get('match', [])
            matches.extend(chunk)
            if len(chunk) < PAGE_SIZE:
                break
            page += 1
        # Deduplicar por ID por si la paginación solapa
        unique = {m.get('matchInfo', {}).get('id'): m for m in matches if m.get('matchInfo', {}).get('id')}
        return list(unique.values())

    def get_match_events(self, match_id: str) -> Optional[Dict[str, Any]]:
        """Descarga los eventos tácticos detallados con coordenadas de un partido."""
        url = (
            f"{self.base_url}/matchevent/{self.outlet_key}/{match_id}"
            f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
        )
        return self._get(url)

    def get_match_stats(self, match_id: str) -> Optional[Dict[str, Any]]:
        """Descarga alineaciones (formación, slots, minutos, capitán) y estadísticas oficiales por jugador."""
        url = (
            f"{self.base_url}/matchstats/{self.outlet_key}/{match_id}"
            f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback&detailed=yes"
        )
        return self._get(url)

    def get_squads(self, season_id: str) -> List[Dict[str, Any]]:
        """Descarga las plantillas completas con nombres, datos personales y posiciones de los jugadores."""
        url = (
            f"{self.base_url}/squads/{self.outlet_key}/"
            f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
            f"&tmcl={season_id}&detailed=yes&_pgSz=100"
        )
        data = self._get(url)
        if not data:
            return []
        return data.get('squad', [])
