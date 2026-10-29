"""
pipeline/catalogo.py
Rellena `opta_catalog` (lo que ve el panel de administración para elegir ligas) a partir de
docs/matchstats_femenino.csv (nivel de matchstats por temporada) y comprueba si cada temporada
con stats por jugadora tiene además eventing (matchevent en una muestra de partidos).

Uso:  python -m pipeline.catalogo [--csv docs/matchstats_femenino.csv] [--dry-run]
"""

import argparse
import csv
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict

from .adapter import OptaSDAPIAdapter
from .storage import Store, get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("catalogo")

CSV_DEFECTO = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs", "matchstats_femenino.csv")
MUESTRA_EVENTING = 3


def tiene_eventing(adapter: OptaSDAPIAdapter, season_id: str) -> bool:
    """Eventing si al menos 2 de 3 partidos jugados (inicio, mitad y final) tienen matchevent."""
    jugados = [f for f in adapter.get_fixtures(season_id)
               if f.get('liveData', {}).get('matchDetails', {}).get('matchStatus') == 'Played']
    if not jugados:
        return False
    idx = sorted({0, len(jugados) // 2, len(jugados) - 1})[:MUESTRA_EVENTING]
    ok = sum(bool(adapter.get_match_events(jugados[i]['matchInfo']['id'])) for i in idx)
    return ok >= min(2, len(idx))


def fila(r: Dict[str, str], eventing: bool) -> Dict[str, Any]:
    return {
        'season_id': r['season_id'], 'competition_id': r['competition_id'],
        'competition_name': r['competition'], 'country': r['country'], 'format': r['format'],
        'season_name': r['season'], 'start_date': r['start'] or None, 'end_date': r['end'] or None,
        'played_matches': int(r['jugados'] or 0), 'data_level': r['nivel'], 'has_eventing': eventing,
    }


def main():
    parser = argparse.ArgumentParser(description="Catálogo Opta para el panel de administración")
    parser.add_argument("--csv", default=CSV_DEFECTO)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    filas = list(csv.DictReader(open(args.csv, encoding="utf-8")))
    con_stats = [r for r in filas if r['nivel'].startswith('jugadora')]
    logger.info(f"{len(filas)} temporadas; comprobando eventing en {len(con_stats)} con stats por jugadora")
    adapter = OptaSDAPIAdapter()
    with ThreadPoolExecutor(8) as pool:
        eventing = dict(zip((r['season_id'] for r in con_stats),
                            pool.map(lambda r: tiene_eventing(adapter, r['season_id']), con_stats)))
    salida = [fila(r, eventing.get(r['season_id'], False)) for r in filas]
    logger.info(f"Con eventing: {sum(eventing.values())} temporadas")

    store = Store(None if args.dry_run else get_supabase_client())
    store.upsert('opta_catalog', salida, on_conflict='season_id')
    logger.info("Catálogo actualizado" if store.online else "Dry-run: no se escribe en BD")


if __name__ == "__main__":
    main()
