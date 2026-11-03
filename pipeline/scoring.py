"""
pipeline/scoring.py
Agregación de temporada y escala 0-10 (port de _agregar_metricas_jugador y
_normalizar_y_guardar de Debrecen_app), aplicada por competición-temporada.

- Rating por partido (escala tipo FotMob, media NOTA_PARTIDO_MEDIA): cada actuación frente a las de su
  grupo de demarcación en la liga, con la jerarquía y los pesos por grupo de categorias.py. Las métricas se
  corrigen por minutos (K_MINUTOS_PARTIDO), los minutos jugados no puntúan y el balón parado solo suma.
- Scores de temporada: una fila por jugador; métricas p90 = media ponderada por minutos
  (equivale a total / minutos * 90), con >= MIN_MINUTOS_TEMPORADA, escaladas contra la liga.
- comp_regularidad: regularidad y tendencia de los scores por partido (CV + pendiente).
- Percentiles 0-99 dentro de la competición.
- radar_data: {metricas: {col: [valor, nota]}, heatmap: {general, por_demarcacion: {dem: rejilla 8x12}},
  pases: {general, por_demarcacion: {zonas: [n, ok, dx, dy] x24, rel: [zona, dem, n, x0, y0, x1, y1],
                                     cuadrado: [dem, n, x0, y0, x1, y1] (top 5 pases al cuadrado)}},
  demarcaciones: {dem: {min, pj}}, similares}.
"""

import json
from statistics import NormalDist
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

from .categorias import (CATEGORIAS, JERARQUIA, JERARQUIA_PORTEROS, MALUS, METRICA_SUB, PESO_DISPONIBILIDAD,
                         PESOS_GRUPO, SIN_CORRECCION)
from .config import (K_MINUTOS_CONFIANZA, K_MINUTOS_PARTIDO, MIN_ACTUACIONES_GRUPO, MIN_JUGADORAS_GRUPO,
                     MIN_MINUTOS_TEMPORADA, NOTA_DESVIACION, NOTA_MEDIA_LIGA, NOTA_PARTIDO_DESVIACION,
                     NOTA_PARTIDO_MEDIA, NOTA_PARTIDO_MIN)

NOTA_COLS = ['nota_global'] + [f'nota_{c}' for c in CATEGORIAS]
SCORE_COLS = ['score_general', 'score_ofensivo', 'score_defensivo', 'score_comportamiento', 'score_abp']

# Agregación: suma (no promediar) / media simple / resto media ponderada por minutos
SUM_METRICS = {'comp_importancia', 'comp_minutos', 'comp_capitan'}
MEAN_METRICS = {'comp_titular_pct', 'comp_regularidad_min90', 'comp_polivalencia_demarcacion', 'def_porteria_cero_pct'}
MALUS_METRICS = set(MALUS)

# Columnas nativas de player_match_stats que se agregan a p90 en player_season_stats
CONTEO_COLS = ['goals', 'assists', 'xg', 'xa', 'xca', 'passes_completed', 'passes_total', 'progressive_passes',
               'takeons_successful', 'takeons_total', 'tackles_won', 'tackles_total', 'interceptions',
               'recoveries', 'aerials_won', 'aerials_total']


def metric_columns(df: pd.DataFrame) -> List[str]:
    return [c for c in df.columns if c.startswith(('comp_', 'of_', 'def_', 'abp_'))]


def scale_0_10(serie: pd.Series, invert: bool = False) -> pd.Series:
    """Escala asimétrica centrada en la media (=5.0): máximo → 10, mínimo → 0. Vectorizada."""
    s = pd.to_numeric(serie, errors='coerce').astype(float)
    mean_v, max_v, min_v = s.mean(), s.max(), s.min()
    if pd.isna(mean_v) or max_v == min_v:
        return pd.Series(5.0, index=s.index)
    arriba = (s >= mean_v) & (max_v > mean_v)
    abajo = (s < mean_v) & (mean_v > min_v)
    up = (s - mean_v) / (max_v - mean_v) if max_v > mean_v else s * 0
    down = (mean_v - s) / (mean_v - min_v) if mean_v > min_v else s * 0
    out = pd.Series(5.0, index=s.index)
    if invert:
        out[arriba] = (5.0 - 5.0 * up[arriba]).clip(lower=0.0)
        out[abajo] = (5.0 + 5.0 * down[abajo]).clip(upper=10.0)
    else:
        out[arriba] = (5.0 + 5.0 * up[arriba]).clip(upper=10.0)
        out[abajo] = (5.0 - 5.0 * down[abajo]).clip(lower=0.0)
    return out.fillna(5.0).round(2)


def _grupos(df: pd.DataFrame, minimo: int) -> pd.Series:
    """Grupo de demarcación de cada fila; los grupos pequeños (o sin grupo) se comparan con toda la liga."""
    return df['grupo_demarcacion'].where(
        df.groupby('grupo_demarcacion')['player_id'].transform('size') >= minimo, '_liga').fillna('_liga')


def _categorias(pcts: pd.DataFrame, grupo: pd.Series) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Percentiles por métrica → (subcategorías, categorías) 0-100: media de sus métricas / subcategorías.
    Porteras con JERARQUIA_PORTEROS, el resto con JERARQUIA. Sin datos → NaN."""
    es_portera = grupo == 'Porteros'
    subs: Dict[str, pd.Series] = {}
    cats = {c: pd.Series(np.nan, index=pcts.index) for c in CATEGORIAS}
    for jerarquia, mask in ((JERARQUIA, ~es_portera), (JERARQUIA_PORTEROS, es_portera)):
        if not mask.any():
            continue
        for cat, _, lista in jerarquia:
            cols_sub = []
            for sub, _, ms in lista:
                presentes = [m for m in ms if m in pcts.columns]
                subs.setdefault(sub, pd.Series(np.nan, index=pcts.index))
                if presentes:
                    subs[sub][mask] = pcts.loc[mask, presentes].mean(axis=1)
                cols_sub.append(sub)
            cats[cat][mask] = pd.DataFrame({k: subs[k][mask] for k in cols_sub}).mean(axis=1)
    return pd.DataFrame(subs, index=pcts.index), pd.DataFrame(cats, index=pcts.index)


def _nota_partido(serie: pd.Series, grupos: pd.Series, mins: pd.Series) -> pd.Series:
    """Escala del rating por partido: media del grupo = NOTA_PARTIDO_MEDIA, ± NOTA_PARTIDO_DESVIACION por
    desviación típica. Media y desviación ponderadas por minutos (las actuaciones largas fijan la escala) y la
    distancia a la media se reduce con pocos minutos (K_MINUTOS_PARTIDO). Sin datos → la media."""
    confianza = ((mins / (mins + K_MINUTOS_PARTIDO)) / (90 / (90 + K_MINUTOS_PARTIDO))).clip(upper=1.0)

    def escalar(g: pd.Series) -> pd.Series:
        ok = g.notna()
        w = mins[g.index][ok]
        if ok.sum() < 3 or w.sum() <= 0:
            return pd.Series(0.0, index=g.index)
        media = np.average(g[ok], weights=w)
        std = np.sqrt(np.average((g[ok] - media) ** 2, weights=w))
        return (g - media) / std if std > 1e-9 else pd.Series(0.0, index=g.index)
    z = serie.groupby(grupos, group_keys=False).apply(escalar).reindex(serie.index).fillna(0.0)
    out = NOTA_PARTIDO_MEDIA + NOTA_PARTIDO_DESVIACION * z * confianza
    return out.clip(NOTA_PARTIDO_MIN, 10.0).round(2)


def scores_por_partido(df_partidos: pd.DataFrame) -> pd.DataFrame:
    """Rating 0-10 de cada actuación (match_id, player_id) frente a las de su grupo de demarcación en la liga.
    1. Cada métrica de la jerarquía (sin Disponibilidad: los minutos no puntúan en el partido) pasa a percentil
       dentro del grupo (empates al rango medio: un 0 en goles, como casi todas, queda cerca de la mitad).
       En balón parado el 0 es "no lanza": sin dato, así que solo suma a quien lo hace.
    2. Subcategoría → categoría → global ponderado con PESOS_GRUPO de su grupo (+ disciplina 10%).
    3. Global y bloques a la escala del partido (_nota_partido), que acerca a la media a quien jugó poco."""
    base = df_partidos[['match_id', 'player_id', 'demarcacion', 'grupo_demarcacion']].copy()
    if df_partidos.empty:
        return base.assign(**{c: pd.Series(dtype=float) for c in SCORE_COLS})
    df = df_partidos
    mins = pd.to_numeric(df['minutes_played'], errors='coerce').fillna(0).clip(lower=1).astype(float)
    grupos = _grupos(df, MIN_ACTUACIONES_GRUPO)
    pcts = {}
    for c, (cat, _) in METRICA_SUB.items():
        if c not in df.columns or cat == 'disponibilidad':
            continue
        v = pd.to_numeric(df[c], errors='coerce').astype(float)
        if cat == 'balon_parado':
            v = v.where(v != 0)
        if not v.notna().any():
            continue
        pcts[c] = v.groupby(grupos, group_keys=False).apply(lambda g, inv=c in MALUS: _percentil_0_100(g, invert=inv))
    pcts = pd.DataFrame(pcts, index=df.index)
    _, cats = _categorias(pcts, df['grupo_demarcacion'])

    # Disciplina (tarjetas y faltas) por partido: menos es mejor
    if 'comp_disciplina_malus' in df.columns:
        d = pd.to_numeric(df['comp_disciplina_malus'], errors='coerce').astype(float)
        disciplina = d.groupby(grupos, group_keys=False).apply(lambda g: _percentil_0_100(g, invert=True))
    else:
        disciplina = pd.Series(np.nan, index=df.index)

    # Global: media ponderada de las categorías con datos, con los pesos de su grupo de demarcación
    num = pd.Series(0.0, index=df.index)
    den = pd.Series(0.0, index=df.index)
    columnas = {**{k: cats[k] for k in cats.columns}, '_disciplina': disciplina}
    for k, col in columnas.items():
        w = df['grupo_demarcacion'].map(lambda g: 0.10 if k == '_disciplina' else
                                        PESOS_GRUPO.get(g, PESOS_GRUPO['Medios']).get(k, 0.0) * 0.90).astype(float)
        w = w.where(col.notna(), 0.0)
        num += col.fillna(0) * w
        den += w
    glob = (num / den).where(den > 0)

    base['score_general'] = _nota_partido(glob, grupos, mins)
    base['score_ofensivo'] = _nota_partido(cats[['ataque', 'construccion']].mean(axis=1), grupos, mins)
    base['score_defensivo'] = _nota_partido(cats['defensa'], grupos, mins)
    base['score_abp'] = _nota_partido(cats['balon_parado'], grupos, mins)
    base['score_comportamiento'] = _nota_partido(disciplina, grupos, mins)
    return base


def calcular_regularidad_scores(scores: np.ndarray) -> float:
    """Regularidad (bajo CV) y progresión (pendiente) de los scores por partido → nota 0-10."""
    scores = scores[~np.isnan(scores)]
    if len(scores) < 3:
        return 5.0
    mean_s = np.mean(scores)
    cv = np.std(scores) / mean_s if mean_s > 0 else 0
    pendiente, _ = np.polyfit(np.arange(len(scores)), scores, 1)
    nota = 6.0 - min(4.0, cv * 8) + float(np.clip(pendiente * 15, -3, 3))
    return round(float(np.clip(nota, 0, 10)), 2)


def _sumar_heatmaps(grp: pd.DataFrame) -> Dict:
    """Campograma de acciones general y por demarcación (suma de rejillas por partido)."""
    if 'heatmap' not in grp:
        return {}
    suma = lambda g: np.sum(np.stack(g['heatmap'].to_numpy()), axis=0).astype(int).tolist()
    return {'general': suma(grp), 'por_demarcacion': {d: suma(g) for d, g in grp.groupby('demarcacion')}}


def _agregar_pases(serie: pd.Series) -> Dict:
    """Suma los pases por zona de varios partidos → dirección media por zona y relaciones
    zona → demarcación receptora con su punto medio de origen y destino (top 40)."""
    zonas, rel, cuadrado = None, {}, {}
    for txt in serie.dropna():
        d = json.loads(txt)
        zonas = d['zonas'] if zonas is None else [[a + b for a, b in zip(za, zb)] for za, zb in zip(zonas, d['zonas'])]
        for k, v in d['rel'].items():
            rel[k] = [a + b for a, b in zip(rel.get(k, [0] * 5), v)]
        for k, v in d.get('cuadrado', {}).items():
            cuadrado[k] = [a + b for a, b in zip(cuadrado.get(k, [0] * 5), v)]
    if zonas is None:
        return {}
    return {
        'zonas': [[int(n), int(ok), round(dx / n, 1) if n else 0, round(dy / n, 1) if n else 0] for n, ok, dx, dy in zonas],
        'rel': [[int(k.split('|')[0]), k.split('|')[1], int(v[0]), *(round(c / v[0], 1) for c in v[1:])]
                for k, v in sorted(rel.items(), key=lambda kv: -kv[1][0])[:40]],
        # Pases al cuadrado (x 60-83, y 25-75) por demarcación receptora: [dem, n, x0, y0, x1, y1] (top 5)
        'cuadrado': [[k, int(v[0]), *(round(c / v[0], 1) for c in v[1:])]
                     for k, v in sorted(cuadrado.items(), key=lambda kv: -kv[1][0])[:5]],
    }


def _sumar_pases(grp: pd.DataFrame) -> Dict:
    if 'pases_json' not in grp:
        return {}
    return {'general': _agregar_pases(grp['pases_json']),
            'por_demarcacion': {d: _agregar_pases(g['pases_json']) for d, g in grp.groupby('demarcacion')}}


def agregar_temporada(df_partidos: pd.DataFrame, df_scores_partido: pd.DataFrame) -> pd.DataFrame:
    """Una fila por jugador con métricas agregadas, conteos p90, campograma y metadatos.
    La demarcación guardada es la principal (la de más minutos)."""
    cols = metric_columns(df_partidos)
    sp = df_scores_partido.merge(df_partidos[['match_id', 'player_id', 'match_date']], on=['match_id', 'player_id'], how='left')
    sp['media_scores'] = sp[SCORE_COLS].mean(axis=1)
    series_scores = {k: g.sort_values('match_date')['media_scores'].to_numpy(dtype=float)
                     for k, g in sp.groupby('player_id')}

    partidos_equipo = df_partidos.groupby('team_id')['match_id'].nunique().to_dict()
    records = []
    for pid, grp in df_partidos.groupby('player_id'):
        mins = grp['minutes_played'].sum()
        if mins < MIN_MINUTOS_TEMPORADA:
            continue
        grp = grp.sort_values('match_date')
        pesos = grp['minutes_played'].to_numpy(dtype=float)
        dems = grp.groupby('demarcacion')['minutes_played'].sum().sort_values(ascending=False)
        principal = dems.index[0]
        row = {
            'player_id': pid,
            'demarcacion': principal,
            'grupo_demarcacion': grp.loc[grp['demarcacion'] == principal, 'grupo_demarcacion'].iloc[0],
            'team_id': grp['team_id'].iloc[-1],
            'matches_played': int(len(grp)),
            'matches_70m': int((grp['minutes_played'] >= 70).sum()),
            'starts': int(grp['is_starter'].sum()),
            'minutes_played': int(mins),
            '_demarcaciones': {d: {'min': int(m), 'pj': int((grp['demarcacion'] == d).sum())} for d, m in dems.items()},
            '_heatmap': _sumar_heatmaps(grp),
            '_pases': _sumar_pases(grp),
        }
        row['starter_pct'] = round(row['starts'] / row['matches_played'] * 100, 2)
        for col in cols:
            vals = pd.to_numeric(grp[col], errors='coerce').to_numpy(dtype=float)
            ok = ~np.isnan(vals)
            # Sin el dato en ningún partido (métrica solo de eventing en partidos sin eventing): NaN, no 0
            if not ok.any():
                row[col] = np.nan
            elif col in SUM_METRICS:
                row[col] = float(vals[ok].sum())
            elif col in MEAN_METRICS:
                row[col] = float(vals[ok].mean())
            else:
                row[col] = float(np.average(vals[ok], weights=pesos[ok])) if pesos[ok].sum() > 0 else 0.0
        row['comp_polivalencia_demarcacion'] = int(len(dems))
        row['disp_partidos'] = int(len(grp))
        # % de los minutos que ha podido jugar: partidos de sus equipos en la temporada x 90
        disponibles = sum(partidos_equipo.get(t, 0) for t in grp['team_id'].unique()) * 90
        row['disp_minutos_equipo_pct'] = round(mins / disponibles * 100, 2) if disponibles else 0.0
        row['comp_regularidad'] = calcular_regularidad_scores(series_scores.get(pid, np.array([])))
        for c in CONTEO_COLS:
            row[f'_sum_{c}'] = float(grp[c].sum())
        records.append(row)
    return pd.DataFrame(records)


def _percentil_0_100(serie: pd.Series, invert: bool = False, rank_method: str = 'average') -> pd.Series:
    """Percentil 0-100 entre los valores no nulos; rank_method='min' para no inflar empates a 0. NaN se queda NaN."""
    validos = serie.dropna()
    if len(validos) == 0:
        return serie * np.nan
    if len(validos) == 1:
        return serie.where(serie.isna(), 50.0)
    r = validos.rank(method=rank_method, ascending=not invert)
    return ((r - 1) / (len(validos) - 1) * 100).reindex(serie.index)


def _relativa_liga(serie: pd.Series, grupos: pd.Series) -> pd.Series:
    """Nota 0-100 relativa a la media del grupo en la liga: NOTA_MEDIA_LIGA + NOTA_DESVIACION * z,
    recortada a [1, 99]. Grupos de menos de 3 jugadoras (o sin varianza) quedan en la media. NaN sigue NaN."""
    def escalar(g: pd.Series) -> pd.Series:
        v = g.dropna()
        if len(v) < 3 or v.std(ddof=0) < 1e-9:
            return g.where(g.isna(), NOTA_MEDIA_LIGA)
        return (NOTA_MEDIA_LIGA + NOTA_DESVIACION * (g - v.mean()) / v.std(ddof=0)).clip(1, 99)
    return serie.groupby(grupos, group_keys=False).apply(escalar).reindex(serie.index)


_INV_NORMAL = np.vectorize(NormalDist().inv_cdf)


def _percentil_a_nota(pct: pd.DataFrame) -> pd.DataFrame:
    """Percentil 0-100 de una métrica → misma escala que las notas (la jugadora mediana = NOTA_MEDIA_LIGA)."""
    p = (pct / 100).clip(0.01, 0.99)
    z = pd.DataFrame(_INV_NORMAL(p.fillna(0.5).to_numpy(dtype=float)), index=pct.index, columns=pct.columns)
    return (NOTA_MEDIA_LIGA + NOTA_DESVIACION * z).clip(1, 99).where(pct.notna())


def puntuar_categorias(df_temp: pd.DataFrame) -> pd.DataFrame:
    """
    Notas 0-100 por métrica, subcategoría, categoría y global (ver pipeline/categorias.py).
    1. Corrección por minutos: valor = (min * p90 + K * media_grupo) / (min + K). Quien juega poco queda
       cerca de la media de su grupo; con muchos minutos manda su propio valor.
    2. Percentil 0-100 frente a su grupo de demarcación en la liga-temporada (toda la liga si el grupo es pequeño).
    3. Subcategoría = media de sus métricas; categoría = media de sus subcategorías; sin datos → NaN.
       Las porteras usan su propia jerarquía (JERARQUIA_PORTEROS); el resto, JERARQUIA.
    4. Global = media ponderada de categorías: Disponibilidad PESO_DISPONIBILIDAD y el resto según el grupo.
    5. Subcategorías, categorías y global se expresan respecto a la media de su grupo en la liga
       (media = NOTA_MEDIA_LIGA, ver _relativa_liga). Las notas por métrica, igual desde su percentil.
    """
    df = df_temp.copy()
    mins = df['minutes_played'].astype(float)
    grupos = _grupos(df, MIN_JUGADORAS_GRUPO)
    pcts = {}
    for c in METRICA_SUB:
        if c not in df.columns:
            continue
        v_orig = pd.to_numeric(df[c], errors='coerce').astype(float)
        v = v_orig.copy()
        if c not in SIN_CORRECCION:
            media = v.groupby(grupos).transform('mean')
            v = (mins * v + K_MINUTOS_CONFIANZA * media) / (mins + K_MINUTOS_CONFIANZA)
            # En métricas positivas (no malus), si la jugadora tiene valor real 0.0, no inflar su valor
            # con la media de grupo: se queda en 0.0 para que el empate a cero no otorgue notas altas.
            if c not in MALUS:
                v = v.where(v_orig > 0, 0.0)

        # Usar method='min' para empates a 0 en métricas positivas, evitando inflar percentiles a la media
        is_malus = c in MALUS
        pct = v.groupby(grupos, group_keys=False).apply(
            lambda g: _percentil_0_100(g, invert=is_malus, rank_method='min' if not is_malus else 'average')
        )
        pcts[c] = pct
    pcts = pd.DataFrame(pcts, index=df.index)
    notas_met = _percentil_a_nota(pcts)

    subs, cats = _categorias(pcts, df['grupo_demarcacion'])

    def nota_global(i):
        pesos = {k: w * (1 - PESO_DISPONIBILIDAD) for k, w in PESOS_GRUPO.get(df.at[i, 'grupo_demarcacion'],
                                                                               PESOS_GRUPO['Medios']).items()}
        pesos['disponibilidad'] = PESO_DISPONIBILIDAD
        validos = {k: w for k, w in pesos.items() if w > 0 and pd.notna(cats.at[i, k])}
        total = sum(validos.values())
        return sum(cats.at[i, k] * w for k, w in validos.items()) / total if total else np.nan

    glob = pd.Series([nota_global(i) for i in df.index], index=df.index, dtype=float)
    df['nota_global'] = _relativa_liga(glob, grupos)
    cats = cats.apply(lambda col: _relativa_liga(col, grupos))
    subs = subs.apply(lambda col: _relativa_liga(col, grupos))
    for cat in CATEGORIAS:
        df[f'nota_{cat}'] = cats[cat]
    df['_notas_met'] = [notas_met.loc[i].to_dict() for i in df.index]
    df['_notas_sub'] = [subs.loc[i].to_dict() for i in df.index]
    return df


def puntuar_temporada(df_temp: pd.DataFrame) -> pd.DataFrame:
    """Añade scores de bloque 0-10, percentiles y notas por métrica (radar) frente a toda la liga."""
    if df_temp.empty:
        return df_temp
    df_temp = puntuar_categorias(df_temp)
    cols = metric_columns(df_temp)
    # Columnas 0-10 de siempre (ranking y listados) a partir de las notas 0-100 por categoría
    a10 = lambda s: (s.fillna(NOTA_MEDIA_LIGA) / 10).round(2)
    df_temp['score_general'] = a10(df_temp['nota_global'])
    df_temp['score_ofensivo'] = a10(df_temp[['nota_ataque', 'nota_construccion']].mean(axis=1))
    df_temp['score_defensivo'] = a10(df_temp['nota_defensa'])
    df_temp['score_abp'] = a10(df_temp['nota_balon_parado'])
    df_temp['score_comportamiento'] = a10(df_temp['nota_disponibilidad'])
    puntos = df_temp[SCORE_COLS]
    for sc in SCORE_COLS:
        pct = puntos[sc].rank(pct=True, method='average') * 99 if len(df_temp) > 1 else 50.0
        df_temp[sc.replace('score_', 'percentile_')] = pct.round(2) if len(df_temp) > 1 else pct
    # Nota de cada métrica (0-10): la de su categoría (percentil corregido por minutos, en la escala de la liga)
    # o, si no está en la jerarquía, la escala clásica frente a la liga
    notas = pd.DataFrame({c: scale_0_10(df_temp[c], invert=c in MALUS_METRICS) for c in cols})
    for i in df_temp.index:
        for c, n in df_temp.at[i, '_notas_met'].items():
            if c in notas.columns and pd.notna(n):
                notas.at[i, c] = round(n / 10, 2)

    # Puesto en la liga por métrica (1 = mejor; en las de malus, menos es mejor). Solo se guarda el top 10
    # y se ignoran valores 0 en las métricas positivas para no premiar empates a cero.
    puestos = pd.DataFrame({c: df_temp[c].rank(ascending=c in MALUS_METRICS, method='min') for c in cols})
    def top10(i):
        out = {}
        for c in cols:
            v = float(df_temp.at[i, c])
            if pd.notna(v) and puestos.at[i, c] <= 10 and (c in MALUS_METRICS or v > 0):
                out[c] = int(puestos.at[i, c])
        return out

    df_temp['radar_data'] = [
        {'metricas': {**{c: [round(float(df_temp.at[i, c]), 3), float(notas.at[i, c])] for c in cols
                         if pd.notna(df_temp.at[i, c])},
                      # Notas 0-100 de categoría y subcategoría: [nota, nota/10] (formato de las métricas)
                      **{f'_cat_{k}': [round(float(df_temp.at[i, f'nota_{k}']), 1),
                                       round(float(df_temp.at[i, f'nota_{k}']) / 10, 2)]
                         for k in CATEGORIAS if pd.notna(df_temp.at[i, f'nota_{k}'])},
                      **{f'_sub_{k}': [round(float(v), 1), round(float(v) / 10, 2)]
                         for k, v in df_temp.at[i, '_notas_sub'].items() if pd.notna(v)}},
         'top10': top10(i), 'jugadoras_liga': int(len(df_temp)),
         'heatmap': df_temp.at[i, '_heatmap'], 'pases': df_temp.at[i, '_pases'], 'demarcaciones': df_temp.at[i, '_demarcaciones']}
        for i in df_temp.index
    ]
    return df_temp


def filas_season_stats(df_temp: pd.DataFrame, competition_id: str, season_id: str, now_iso: str) -> List[Dict]:
    """Convierte el resultado de puntuar_temporada en filas de public.player_season_stats."""
    def per90(row, c):
        return round(row[f'_sum_{c}'] / row['minutes_played'] * 90, 3) if row['minutes_played'] else 0.0

    def pct(num, den):
        return round(num / den * 100, 2) if den else 0.0

    out = []
    for _, r in df_temp.iterrows():
        out.append({
            'player_id': r['player_id'],
            'season_id': season_id,
            'competition_id': competition_id,
            'team_id': r['team_id'],
            'demarcacion': r['demarcacion'],
            'grupo_demarcacion': r['grupo_demarcacion'],
            'matches_played': int(r['matches_played']),
            'matches_70m': int(r['matches_70m']),
            'starts': int(r['starts']),
            'minutes_played': int(r['minutes_played']),
            'starter_pct': float(r['starter_pct']),
            **{sc: float(r[sc]) for sc in SCORE_COLS},
            **{sc.replace('score_', 'percentile_'): float(r[sc.replace('score_', 'percentile_')]) for sc in SCORE_COLS},
            'goals_p90': per90(r, 'goals'),
            'assists_p90': per90(r, 'assists'),
            'xg_p90': per90(r, 'xg'),
            'xa_p90': per90(r, 'xa'),
            'xca_p90': per90(r, 'xca'),
            'passes_p90': per90(r, 'passes_completed'),
            'passes_pct': pct(r['_sum_passes_completed'], r['_sum_passes_total']),
            'progressive_passes_p90': per90(r, 'progressive_passes'),
            'takeons_p90': per90(r, 'takeons_successful'),
            'takeons_pct': pct(r['_sum_takeons_successful'], r['_sum_takeons_total']),
            'tackles_p90': per90(r, 'tackles_won'),
            'tackles_pct': pct(r['_sum_tackles_won'], r['_sum_tackles_total']),
            'interceptions_p90': per90(r, 'interceptions'),
            'recoveries_p90': per90(r, 'recoveries'),
            'aerials_p90': per90(r, 'aerials_won'),
            'aerials_pct': pct(r['_sum_aerials_won'], r['_sum_aerials_total']),
            **{k: (round(float(r[k]), 1) if pd.notna(r[k]) else None) for k in NOTA_COLS},
            'radar_data': r['radar_data'],
            'updated_at': now_iso,
        })
    return out


def calcular_temporada(df_partidos: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Punto de entrada: (scores por partido, tabla de temporada puntuada)."""
    if df_partidos.empty:
        return pd.DataFrame(), pd.DataFrame()
    df_sp = scores_por_partido(df_partidos)
    df_temp = puntuar_temporada(agregar_temporada(df_partidos, df_sp))
    return df_sp, df_temp


def calcular_similares(filas: List[Dict], top: int = 10) -> Dict[str, List[Dict]]:
    """Similitud coseno entre perfiles de notas (nota - media de la métrica) de todas las filas de temporada,
    de cualquier liga. Devuelve {player_id: [{player_id, sim}]} con los `top` más parecidos."""
    if len(filas) < 2:
        return {}
    cols = sorted({c for f in filas for c in (f.get('radar_data') or {}).get('metricas', {}) if not c.startswith('_')})
    ids = [f['player_id'] for f in filas]
    m = np.array([[((f.get('radar_data') or {}).get('metricas', {}).get(c) or [0, np.nan])[1] for c in cols]
                  for f in filas], dtype=np.float32)
    # Centrado por métrica (sin dato = media): las notas de jerarquía y las de escala clásica tienen distinta media
    m = np.nan_to_num(m - np.nanmean(m, axis=0, keepdims=True))
    m /= np.maximum(np.linalg.norm(m, axis=1, keepdims=True), 1e-6)
    out = {}
    for i0 in range(0, len(ids), 1000):
        sims = m[i0:i0 + 1000] @ m.T
        for k, fila in enumerate(sims):
            i = i0 + k
            fila[i] = -2
            idx = np.argpartition(-fila, top)[:top]
            idx = idx[np.argsort(-fila[idx])]
            out[ids[i]] = [{'player_id': ids[j], 'sim': round(float((fila[j] + 1) * 50), 1)} for j in idx]
    return out
