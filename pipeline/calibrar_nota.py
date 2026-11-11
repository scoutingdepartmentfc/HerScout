"""
pipeline/calibrar_nota.py
Calibra la nota por partido (0-10) con las de FotMob, que usan la misma escala que Flashscore/SofaScore.

1. Descarga las notas de FotMob de las ligas de CALIBRACION (caché en .cache/fotmob_notas/).
2. Las cruza con la caché de métricas por partido de Opta: mismo día + nombre de la jugadora (+ minutos).
3. Ajusta, por grupo de demarcación, una regresión ridge nota ~ acciones del partido (conteos, no p90):
   - 'completo': con las métricas de eventing (xG, tiros, pases clave...).
   - 'base': solo columnas de matchstats, para competiciones sin eventing.
4. Guarda coeficientes en pipeline/modelos/nota_partido.json (lo usa scoring.nota_partido_modelo).

Uso: python -m pipeline.calibrar_nota [--sin-descarga]
"""

import argparse
import json
import logging
import time
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd
from rapidfuzz import fuzz

from .config import LOCAL_CACHE_DIR
from .photos import FotMobClient, normalizar
from .scoring import FEATURES_NOTA, MODELO_NOTA_PATH, features_nota
from .storage import Store, get_supabase_client

logger = logging.getLogger(__name__)

# (id liga FotMob, temporada FotMob, season_id Opta)
CALIBRACION = [
    (9907, '2025/2026', 'djelzk9437o7odzfkuo137das'),  # Liga F
    (9907, '2026/2027', 'c2wqs5xvkpwffbp3gynepo2z8'),
    (9227, '2025/2026', '221phckhkd7y6rg3uyava3ifo'),  # WSL
    (9227, '2026/2027', 'b98jgqlofjpbpvjb8hk20z3tg'),
    (9676, '2025/2026', 'br2imckbqwr0wvucakfvdp05w'),  # Frauen-Bundesliga
    (9676, '2026/2027', 'brivllc6qxkuq87ebk06n69sk'),
]
DIR_NOTAS = Path(LOCAL_CACHE_DIR) / 'fotmob_notas'


def _stat(stats: List[Dict], key: str):
    for bloque in stats or []:
        for v in (bloque.get('stats') or {}).values():
            if v.get('key') == key:
                return (v.get('stat') or {}).get('value')
    return None


def descargar_notas(fm: FotMobClient, liga: int, temporada: str) -> pd.DataFrame:
    """Notas de FotMob de los partidos terminados de una liga-temporada (caché por partido en disco)."""
    d = fm._json('leagues', id=liga, season=temporada) or {}
    partidos = [m for m in d.get('fixtures', {}).get('allMatches', []) if m.get('status', {}).get('finished')]
    destino = DIR_NOTAS / f'{liga}_{temporada.replace("/", "-")}'
    destino.mkdir(parents=True, exist_ok=True)
    filas = []
    for i, m in enumerate(partidos):
        f = destino / f"{m['id']}.json"
        if f.exists():
            filas += json.loads(f.read_text())
            continue
        md = fm._json('matchDetails', matchId=m['id'])
        time.sleep(0.4)
        if not md:
            continue
        rows = []
        for p in ((md.get('content') or {}).get('playerStats') or {}).values():
            stats = p.get('stats')
            nota, mins = _stat(stats, 'rating_title'), _stat(stats, 'minutes_played')
            if nota is None or not mins:
                continue
            rows.append({'fm_match_id': m['id'], 'fecha': m['status']['utcTime'][:10], 'nombre': p.get('name'),
                         'equipo': p.get('teamName'), 'nota_fm': float(nota), 'min_fm': int(mins),
                         'goles_fm': _stat(stats, 'goals') or 0, 'asist_fm': _stat(stats, 'assists') or 0})
        f.write_text(json.dumps(rows))
        filas += rows
        if i % 25 == 0:
            logger.info(f'  FotMob {liga} {temporada}: {i + 1}/{len(partidos)} partidos')
    return pd.DataFrame(filas)


def cruzar(notas: pd.DataFrame, cache: pd.DataFrame) -> pd.DataFrame:
    """Une cada nota de FotMob con su fila (match_id, player_id) de Opta: mismo día, nombre parecido
    (token_set_ratio >= 85) y minutos a +-5; si hay varias, la de nombre más parecido."""
    cache = cache.assign(fecha=cache['match_date'].astype(str).str[:10], _n=cache['player_name'].map(normalizar))
    por_dia = {k: g for k, g in cache.groupby('fecha')}
    out = []
    for r in notas.itertuples():
        cand = por_dia.get(r.fecha)
        if cand is None:
            continue
        cand = cand[(cand['minutes_played'] - r.min_fm).abs() <= 5]
        if cand.empty:
            continue
        n = normalizar(r.nombre)
        sims = cand['_n'].map(lambda x: fuzz.token_set_ratio(x, n))
        if sims.max() >= 85 and (sims == sims.max()).sum() == 1:
            fila = cand.loc[sims.idxmax()]
            out.append({'match_id': fila['match_id'], 'player_id': fila['player_id'], 'nota_fm': r.nota_fm})
    return pd.DataFrame(out).drop_duplicates(['match_id', 'player_id'])


def ajustar(X: pd.DataFrame, y: pd.Series, grupos_partido: pd.Series) -> Dict:
    """Ridge con estandarización y alpha por validación cruzada agrupada por partido. Devuelve coeficientes en
    la escala original (nota = intercept + sum(coef * x)) y el error de validación."""
    from sklearn.linear_model import RidgeCV
    from sklearn.model_selection import GroupKFold, cross_val_predict
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    modelo = make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-2, 3, 20)))
    pred = cross_val_predict(modelo, X, y, groups=grupos_partido, cv=GroupKFold(n_splits=5))
    modelo.fit(X, y)
    sc, rg = modelo[0], modelo[1]
    coef = rg.coef_ / np.where(sc.scale_ > 0, sc.scale_, 1)
    intercept = float(rg.intercept_ - (coef * sc.mean_).sum())
    return {'intercept': round(intercept, 5), 'coef': {c: round(float(v), 5) for c, v in zip(X.columns, coef)},
            'mae_cv': round(float(np.mean(np.abs(np.clip(pred, 3, 10) - y))), 3), 'n': int(len(y))}


def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
    ap = argparse.ArgumentParser()
    ap.add_argument('--sin-descarga', action='store_true', help='Solo usar las notas ya descargadas')
    args = ap.parse_args()

    store, fm = Store(get_supabase_client()), FotMobClient()
    datos = []
    for liga, temporada, sid in CALIBRACION:
        if args.sin_descarga:
            d = DIR_NOTAS / f'{liga}_{temporada.replace("/", "-")}'
            notas = pd.DataFrame([r for f in d.glob('*.json') for r in json.loads(f.read_text())]) if d.exists() else pd.DataFrame()
        else:
            notas = descargar_notas(fm, liga, temporada)
        cache = store.load_match_cache(sid)
        if notas.empty or cache.empty:
            logger.warning(f'{liga} {temporada}: sin notas o sin caché')
            continue
        cruce = cruzar(notas, cache)
        logger.info(f'{liga} {temporada}: {len(notas)} notas FotMob, {len(cruce)} cruzadas con Opta')
        feats = features_nota(cache)
        datos.append(cache[['match_id', 'player_id', 'grupo_demarcacion']].join(feats).merge(cruce, on=['match_id', 'player_id']))
    df = pd.concat(datos, ignore_index=True)
    df = df[df['_con_stats']]
    logger.info(f'Calibración con {len(df)} actuaciones')

    modelo = {'fuente': 'FotMob', 'ligas': [f'{l} {t}' for l, t, _ in CALIBRACION], 'grupos': {}}
    for grupo, g in df.groupby('grupo_demarcacion'):
        modelo['grupos'][grupo] = {}
        for tipo, cols in FEATURES_NOTA.items():
            gg = g.dropna(subset=cols)
            if len(gg) < 200:
                continue
            modelo['grupos'][grupo][tipo] = ajustar(gg[cols], gg['nota_fm'], gg['match_id'])
            logger.info(f"  {grupo:12s} {tipo:8s} n={len(gg):5d} MAE={modelo['grupos'][grupo][tipo]['mae_cv']}")
    Path(MODELO_NOTA_PATH).write_text(json.dumps(modelo, indent=1, ensure_ascii=False))
    logger.info(f'Modelo guardado en {MODELO_NOTA_PATH}')


if __name__ == '__main__':
    main()
