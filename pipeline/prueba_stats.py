"""Prueba de una liga SIN escribir nada (ni BD ni JSON): descarga de Opta, calcula métricas y ratings en memoria
e informa de qué estadísticas llegan y qué notas saldrían.
Uso: python -m pipeline.prueba_stats --liga <competition_id> [--max-matches 30]"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import pandas as pd
from .adapter import OptaSDAPIAdapter
from .config import NIVEL_LIGA, NIVEL_LIGA_DEFECTO
from .metrics_engine import MetricsEngine
from .scoring import calcular_temporada
from .storage import Store, competiciones_objetivo, get_supabase_client
from .ingest import STAT_COLS

NUEVAS = ['of_toques_p90', 'of_toques_area_rival_p90', 'of_pases_ultimo_tercio_p90', 'of_entradas_area_p90',
          'of_conducciones_progresivas_p90', 'of_pases_filtrados_p90', 'of_grandes_ocasiones_creadas_p90',
          'of_perdidas_p90', 'def_duelos_ganados_pct', 'def_recup_tercio_medio_p90', 'def_despejes_p90']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--liga', required=True)
    ap.add_argument('--max-matches', type=int, default=30)
    a = ap.parse_args()
    store = Store(get_supabase_client())
    comp = next(c for c in competiciones_objetivo(store) if c['id'] == a.liga and c.get('active', True))
    opta = OptaSDAPIAdapter()
    jugados = [f for f in opta.get_fixtures(comp['season_id'])
               if f.get('liveData', {}).get('matchDetails', {}).get('matchStatus') == 'Played']
    jugados = sorted(jugados, key=lambda f: f['matchInfo'].get('date', ''))[-a.max_matches:]
    ev = comp.get('fuente', 'eventing') == 'eventing'
    bajar = lambda f: (opta.get_match_events(f['matchInfo']['id']) if ev else None,
                       opta.get_match_stats(f['matchInfo']['id']))
    filas, tipos, n_jug = [], {}, 0
    with ThreadPoolExecutor(8) as pool:
        for (events, ms), f in zip(pool.map(bajar, jugados), jugados):
            if not ms:
                continue
            for lu in ms.get('liveData', {}).get('lineUp', []):
                for p in lu.get('player', []):
                    st = {s['type'] for s in p.get('stat', [])}
                    if 'minsPlayed' in st:
                        n_jug += 1
                        for t in st:
                            tipos[t] = tipos.get(t, 0) + 1
            for r in MetricsEngine(events, ms).process_match() or []:
                filas.append({'match_id': f['matchInfo']['id'], 'player_id': r['player_id'], 'team_id': r['team_id'],
                              'player_name': r['player_name'], 'match_date': f['matchInfo'].get('date'),
                              **{c: r[c] for c in STAT_COLS}, **r['metrics']})
    df = pd.DataFrame(filas)
    print(f"\n=== {comp['name']} · {len(jugados)} partidos · {n_jug} actuaciones · eventing={ev} ===")
    print("\nEstadísticas Opta (% de actuaciones en que aparecen; Opta omite los ceros):")
    for t, n in sorted(tipos.items(), key=lambda x: -x[1]):
        print(f"  {t:38s} {n / n_jug * 100:5.1f}%")
    print("\nMétricas nuevas (% de actuaciones con dato · media):")
    for c in NUEVAS:
        s = df[c] if c in df else pd.Series(dtype=float)
        print(f"  {c:38s} {s.notna().mean() * 100:5.1f}%  {s.mean():.2f}")
    _, temp = calcular_temporada(df, NIVEL_LIGA.get(comp['id'], NIVEL_LIGA_DEFECTO))
    temp = temp[~temp['_muestra_baja']] if '_muestra_baja' in temp else temp
    print("\nTop 20 rating (0-100):")
    print(temp.sort_values('nota_global', ascending=False)[['player_name', 'grupo_demarcacion', 'minutes_played',
          'nota_global']].head(20).to_string(index=False))


if __name__ == '__main__':
    main()
