"""
pipeline/metrics_engine.py
Motor de métricas por demarcación partido a partido.
Port de Debrecen_app/calcular_metricas_demarcacion.py: mismas fórmulas (xCA, regularidad por
tramos, polivalencia, continuidad de aéreos, pases con ventaja, x2 por rol...)
aplicadas a un único partido, sin ponderar por rol: todas las métricas para todos los jugadores. La agregación de temporada y la escala 0-9.9 están en scoring.py.

Correcciones respecto al original:
- Las conducciones se cuentan por partido (antes se sumaba el total del lote a cada partido).
- xCA: el bonus de "evento siguiente exitoso" usaba una columna que nunca se generaba.
- Autogoles fuera de goles; tanda de penaltis y eventos borrados fuera de las métricas.
"""

import json
import math
from collections import Counter
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .events import build_lineups, events_to_dataframe
from .xg_model import aplicar_xg_xa

EVENTOS_OF = ['Miss', 'Pass', 'Post', 'Goal', 'Take On', 'Clearance', 'Attempt Saved']
EVENTOS_TIRO = ['Miss', 'Attempt Saved', 'Post', 'Goal']
HM_ROWS, HM_COLS = 8, 12  # rejilla del campograma de acciones (y, x)
PZ_BANDAS, PZ_CARRILES = 6, 4  # zonas del campograma de pases (x, y)
CUADRADO_X, CUADRADO_Y = (60, 83), (25, 75)  # "cuadrado": zona de destino de pase entre líneas


# ──────────────────────────────────────────────────────────────
# UTILIDADES
# ──────────────────────────────────────────────────────────────

def es_si(df, col):
    if col not in df.columns:
        return pd.Series(False, index=df.index)
    col_data = df[col]
    if pd.api.types.is_numeric_dtype(col_data):
        return col_data > 0
    s = col_data.astype(str).str.strip().str.lower()
    return ~s.isin(['no', 'false', '0', '0.0', 'nan', 'none', '']) & col_data.notna()


def to_num(df, col):
    if col not in df.columns:
        return pd.Series(np.nan, index=df.index)
    return pd.to_numeric(df[col].replace(['No', ''], np.nan), errors='coerce')


def pct_series(num, den):
    return float(num / den * 100) if den and den > 0 else 0.0


def p90(val, mins):
    return float(val) / float(mins) * 90 if mins > 0 else 0.0


def prep_eventos_secuenciales(df: pd.DataFrame) -> pd.DataFrame:
    """Ordena los eventos del partido y añade el contexto del evento anterior/siguiente."""
    df = df.copy()
    # Flags "Sí"/"No" → bool y textos → object: con los strings de Arrow (pandas 3) cada
    # filtro booleano copia columna a columna y el cálculo es ~10x más lento.
    for col in df.columns:
        if df[col].dtype == bool or pd.api.types.is_numeric_dtype(df[col]):
            continue
        valores = set(df[col].dropna().unique())
        if valores <= {'Sí', 'No'}:
            df[col] = df[col] == 'Sí'
        else:
            df[col] = df[col].astype(object)
    for col in ['x', 'y', 'outcome', 'timeMin', 'timeSec', 'periodId']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df['Pass End X'] = to_num(df, 'Pass End X')
    df['Pass End Y'] = to_num(df, 'Pass End Y')
    df['time_abs'] = df['timeMin'].fillna(0) * 60 + df['timeSec'].fillna(0)
    df = df.sort_values(by=['periodId', 'time_abs', 'timeStamp', 'EventId'], kind='stable').reset_index(drop=True)

    for col in ['Team ID', 'playerId', 'Event Name', 'Pass End X', 'Pass End Y', 'outcome', 'x', 'y', 'timeMin', 'timeSec']:
        df[f'prev_{col}'] = df[col].shift(1)
    df['prev_Cross'] = es_si(df, 'Cross').shift(1)
    for col in ['Team ID', 'Event Name', 'x', 'y', 'Pass End X', 'Pass End Y', 'outcome']:
        df[f'next_{col}'] = df[col].shift(-1)
    # copy() consolida los bloques internos: cada filtro posterior copia 3-4 bloques en vez de ~100
    return df.copy()


# ──────────────────────────────────────────────────────────────
# FÓRMULAS COMPLEJAS
# ──────────────────────────────────────────────────────────────

def calc_xca(grp):
    """
    xCA centrada en rango [-1.0, 1.0] por pase.
    Secuencia: p1 (pase previo de un compañero) -> p2 (pase analizado del jugador).
    """
    mask = (
        (grp['Event Name'] == 'Pass') &
        (grp['outcome'] == 1) &
        (grp['prev_Event Name'] == 'Pass') &
        (grp['prev_outcome'] == 1) &
        (grp['prev_Team ID'] == grp['Team ID']) &
        (grp['prev_playerId'] != grp['playerId'])
    )
    xca_events = grp[mask]
    if xca_events.empty:
        return 0.0

    total_xca = 0.0
    for _, p2 in xca_events.iterrows():
        p1_x, p1_y = p2['prev_x'], p2['prev_y']
        p1_end_x, p1_end_y = p2['prev_Pass End X'], p2['prev_Pass End Y']
        p2_x, p2_y = p2['x'], p2['y']
        p2_end_x, p2_end_y = p2['Pass End X'], p2['Pass End Y']
        if any(pd.isna(v) for v in [p1_x, p1_y, p1_end_x, p1_end_y, p2_x, p2_y, p2_end_x, p2_end_y]):
            continue

        puntuacion = 0.0

        # 1. Progresión neta (eje X)
        prog_x = p2_end_x - p1_x
        if prog_x < -5:
            puntuacion -= 0.40 * min(abs(prog_x) / 40, 1.0)
        elif prog_x < 5:
            puntuacion -= 0.15
        else:
            puntuacion += (prog_x / 100) * 0.45

        # 2. Amenaza (destino cerca de portería rival)
        if p2_end_x > 65:
            dist_porteria = math.hypot(100 - p2_end_x, 50 - p2_end_y)
            if dist_porteria < 40:
                puntuacion += ((40 - dist_porteria) / 40) * 0.35

        # 3. Velocidad (tiempo que retiene el balón)
        ts1 = p2['prev_timeMin'] * 60 + p2['prev_timeSec']
        ts2 = p2['timeMin'] * 60 + p2['timeSec']
        tiempo = max(0, ts2 - ts1) if pd.notna(ts1) and pd.notna(ts2) else 0
        if tiempo <= 1.5:
            puntuacion += 0.15
        elif tiempo > 4:
            puntuacion -= 0.15

        # 4. Amplitud y cambio de orientación
        dif_y = abs(p2_end_y - p1_y)
        if dif_y > 30:
            puntuacion += (dif_y / 100) * 0.15

        # 5. Conducción hacia adelante
        prog_conduccion = p2_x - p1_end_x
        if prog_conduccion > 5:
            puntuacion += min(prog_conduccion / 30, 1.0) * 0.10

        # 6. Éxito de la acción inmediatamente posterior
        if p2.get('next_outcome') == 1 and p2.get('next_Team ID') == p2['Team ID']:
            puntuacion += 0.10

        total_xca += round(max(-1.0, min(1.0, puntuacion)), 3)

    return total_xca


def calc_continuidad_aereos(df_aereos, df_partido, t_id):
    exitos = 0
    for _, row in df_aereos.iterrows():
        t0, per = row['time_abs'], row['periodId']
        futuro = df_partido[(df_partido['periodId'] == per) & (df_partido['time_abs'] > t0) & (df_partido['time_abs'] <= t0 + 3)]
        if ((futuro['Team ID'] == t_id) & futuro['Event Name'].isin(EVENTOS_OF)).any():
            exitos += 1
    return exitos


def calc_remates_falta_5s(df_remates, df_partido, t_id):
    exitos = 0
    for _, row in df_remates.iterrows():
        t0, per = row['time_abs'], row['periodId']
        pasado = df_partido[(df_partido['periodId'] == per) & (df_partido['time_abs'] >= t0 - 5) & (df_partido['time_abs'] < t0)]
        if ((pasado['Team ID'] == t_id) & es_si(pasado, 'Free kick taken')).any():
            exitos += 1
    return exitos


def calcular_polivalencia(grp_ofensivo):
    x = to_num(grp_ofensivo, 'x').clip(0, 100)
    y = to_num(grp_ofensivo, 'y').clip(0, 100)
    zona_x = pd.cut(x, bins=[0, 16.6, 33.3, 50, 66.6, 83.3, 100], labels=False, include_lowest=True)
    zona_y = pd.cut(y, bins=[0, 33.3, 66.6, 100], labels=False, include_lowest=True)
    return len(set(zip(zona_x, zona_y)))


def calcular_regular_polivalencia(grp):
    """Volumen de acciones exitosas en 18 zonas: premia variedad y equilibrio (entropía)."""
    grp_ok = grp[to_num(grp, 'outcome') == 1]
    if grp_ok.empty:
        return 0.0
    x = to_num(grp_ok, 'x').clip(0, 100)
    y = to_num(grp_ok, 'y').clip(0, 100)
    zona_x = pd.cut(x, bins=[0, 16.6, 33.3, 50, 66.6, 83.3, 100], labels=False, include_lowest=True)
    zona_y = pd.cut(y, bins=[0, 33.3, 66.6, 100], labels=False, include_lowest=True)
    conteo_zonas = (zona_x * 3 + zona_y).value_counts()
    variedad = len(conteo_zonas)
    props = conteo_zonas / conteo_zonas.sum()
    entropia = -np.sum(props * np.log(props))
    return float(variedad * (1 + entropia))


def calcular_regularidad_min90(grp):
    """Impacto en 6 tramos de 15 min: premia volumen alto y sostenido (baja desviación)."""
    if grp.empty:
        return 0.0
    t_min = grp['timeMin'].fillna(0)
    t_sec = grp['timeSec'].fillna(0)
    p_id = grp['periodId'].fillna(1)
    min_abs = t_min + (t_sec / 60.0)
    min_abs = np.where((p_id == 2) & (t_min < 45), min_abs + 45, min_abs)
    min_abs = np.where((p_id == 3) & (t_min < 90), min_abs + 90, min_abs)
    min_abs = np.where((p_id == 4) & (t_min < 105), min_abs + 105, min_abs)
    tramos = pd.Series(min_abs // 15, index=grp.index).clip(0, 5)

    scores = []
    for tramo in range(6):
        g = grp[tramos == tramo]
        if g.empty:
            scores.append(0.0)
            continue
        exitos = (g['outcome'] == 1).sum()
        defensivas = g['Event Name'].isin(['Ball recovery', 'Interception', 'Clearance']).sum()
        tiros = g['Event Name'].isin(['Miss', 'Attempt Saved', 'Post']).sum()
        goles = (g['Event Name'] == 'Goal').sum()
        asistencias = (to_num(g, 'Assist') > 0).sum()
        scores.append(exitos + defensivas * 1.5 + tiros * 2 + asistencias * 5 + goles * 10)

    return float(np.mean(scores) / (1 + np.std(scores)))


# ──────────────────────────────────────────────────────────────
# MÉTRICAS DE UN JUGADOR EN UN PARTIDO
# ──────────────────────────────────────────────────────────────

def calc_metricas_jugador(grp, df_events, pid, t_id, mins_played, titular_pct, veces_capitan,
                          partidos, partidos_70m, dem, num_dems_jugadas):
    ev_name = grp['Event Name']
    outcome = grp['outcome']
    x = grp['x']
    y = grp['y']
    pass_x_end = grp['Pass End X']
    pass_y_end = grp['Pass End Y']

    # ─── 1. COMPORTAMIENTO ─────────────────────────────────────
    cards = grp[ev_name == 'Card']
    disciplina_malus = (
        es_si(cards, 'Yellow Card').sum() + es_si(cards, 'Second yellow').sum() + es_si(cards, 'Red Card').sum()
        + es_si(grp, 'Foul and Abusive Language').sum() + es_si(grp, 'Violent Conduct').sum()
        + (ev_name == 'Foul').sum() + es_si(grp, 'Serious Foul').sum()
    )
    m_comp = {
        'comp_importancia': partidos + mins_played + partidos_70m,
        'comp_regularidad': 0.0,  # se calcula en la agregación con los scores por partido
        'comp_disciplina_malus': p90(disciplina_malus, mins_played),
        'comp_minutos': mins_played,
        'comp_titular_pct': titular_pct,
        'comp_capitan': veces_capitan,
        'comp_regularidad_min90': calcular_regularidad_min90(grp),
        'comp_polivalencia_demarcacion': num_dems_jugadas,
    }

    # ─── 2. OFENSIVO (generales) ───────────────────────────────
    grp_of = grp[ev_name.isin(EVENTOS_OF)]

    goles = (ev_name == 'Goal').sum()
    no_pen = (grp['Penalty'] == 'No') if 'Penalty' in grp.columns else pd.Series(True, index=grp.index)
    goles_sin_penalti = ((ev_name == 'Goal') & no_pen).sum()
    assist_col = to_num(grp, 'Assist')
    asistencias = assist_col.isin([13, 14, 15]).sum()
    asist_gol = (assist_col == 16).sum()

    passes = grp[ev_name == 'Pass']
    pases_ok = (passes['outcome'] == 1).sum()

    p_prog = passes[((pass_x_end - x > 15) & ((pass_y_end - y).abs() <= 20)).loc[passes.index]]
    p_prog_ok = (p_prog['outcome'] == 1).sum()
    p_prog_cen = passes[((pass_x_end - x > 15) & pass_y_end.between(30, 70)).loc[passes.index]]
    p_prog_cen_ok = (p_prog_cen['outcome'] == 1).sum()
    switches = passes[es_si(passes, 'Switch of play')]
    cambios_ori_ok = (switches['outcome'] == 1).sum()
    takeons = grp[ev_name == 'Take On']
    regates_ok = (takeons['outcome'] == 1).sum()
    tiros = grp[ev_name.isin(EVENTOS_TIRO)]
    tiros_dentro = tiros['Event Name'].isin(['Attempt Saved', 'Goal']).sum()

    left_foot = es_si(grp, 'Left footed').sum()
    right_foot = es_si(grp, 'Right footed').sum()
    tot_feet = left_foot + right_foot
    ambidiestro_pct = (min(left_foot, right_foot) / tot_feet * 100) * 2 if tot_feet > 0 else 0.0

    xg_sum = float(grp['Expected Goals'].sum()) if 'Expected Goals' in grp.columns else 0.0
    xg_sin_penalti = float(grp.loc[no_pen, 'Expected Goals'].sum()) if 'Expected Goals' in grp.columns else 0.0
    xa_sum = float(grp['Expected Assist'].sum()) if 'Expected Assist' in grp.columns else 0.0

    m_of_gen = {
        'of_polivalencia': calcular_polivalencia(grp_of),
        'of_goles_p90': p90(goles, mins_played),
        'of_goles_sin_penalti_p90': p90(goles_sin_penalti, mins_played),
        'of_asistencias_p90': p90(asistencias, mins_played),
        'of_asistencia_gol_p90': p90(asist_gol, mins_played),
        'of_pases_buenos_p90': p90(pases_ok, mins_played),
        'of_pases_pct': pct_series(pases_ok, len(passes)),
        'of_progresivos_p90': p90(p_prog_ok, mins_played),
        'of_progresivos_pct': pct_series(p_prog_ok, len(p_prog)),
        'of_prog_cen_p90': p90(p_prog_cen_ok, mins_played),
        'of_prog_cen_pct': pct_series(p_prog_cen_ok, len(p_prog_cen)),
        'of_cambios_ori_p90': p90(cambios_ori_ok, mins_played),
        'of_cambios_ori_pct': pct_series(cambios_ori_ok, len(switches)),
        'of_regates_p90': p90(regates_ok, mins_played),
        'of_regates_pct': pct_series(regates_ok, len(takeons)),
        'of_tiros_p90': p90(len(tiros), mins_played),
        'of_tiros_dentro_pct': pct_series(tiros_dentro, len(tiros)),
        'of_regular_polivalencia': calcular_regular_polivalencia(grp_of),
        'of_xCA_p90': p90(calc_xca(grp), mins_played),
        'of_ambidiestro_pct': ambidiestro_pct,
        'of_xG_p90': p90(xg_sum, mins_played),
        'of_xg_sin_penalti_p90': p90(xg_sin_penalti, mins_played),
        'of_xA_p90': p90(xa_sum, mins_played),
    }

    # ─── 3. DEFENSIVO (generales) ──────────────────────────────
    aerials = grp[ev_name == 'Aerial']
    aereos_ok = (aerials['outcome'] == 1).sum()
    aereos_cont = calc_continuidad_aereos(aerials[aerials['outcome'] == 1], df_events, t_id)
    recup = (ev_name == 'Ball recovery').sum()
    tackles = grp[ev_name == 'Tackle']
    entradas_ok = (tackles['outcome'] == 1).sum()
    intercep = (ev_name == 'Interception').sum()

    m_def_gen = {
        'def_aereos_ganados_p90': p90(aereos_ok, mins_played),
        'def_aereos_ganados_pct': pct_series(aereos_ok, len(aerials)),
        'def_aereos_continuidad_p90': p90(aereos_cont, mins_played),
        'def_recuperaciones_p90': p90(recup, mins_played),
        'def_entradas_p90': p90(entradas_ok, mins_played),
        'def_entradas_pct': pct_series(entradas_ok, len(tackles)),
        'def_intercepciones_p90': p90(intercep, mins_played),
    }

    # ─── 4. ABP (generales) ────────────────────────────────────
    corners = grp[es_si(grp, 'Corner taken')]
    faltas_lej = grp[es_si(grp, 'Free kick taken') & (x > 50)]
    remates_corner = es_si(tiros, 'From corner')
    goles_falta_dir = (ev_name == 'Goal') & es_si(grp, 'Free kick')
    lanz_penalti = (grp['Penalty taker ID'].astype(str) == str(pid)).sum() if 'Penalty taker ID' in grp.columns else 0

    m_abp_gen = {
        'abp_lanzador_corner_p90': p90(len(corners), mins_played),
        'abp_lanzador_corner_pct': pct_series((corners['outcome'] == 1).sum(), len(corners)),
        'abp_faltas_lejanas_p90': p90(len(faltas_lej), mins_played),
        'abp_faltas_lejanas_pct': pct_series((faltas_lej['outcome'] == 1).sum(), len(faltas_lej)),
        'abp_remates_corner_p90': p90(remates_corner.sum(), mins_played),
        'abp_remates_faltas_p90': p90(calc_remates_falta_5s(tiros, df_events, t_id), mins_played),
        'abp_lanzador_faltas_dir_p90': p90(es_si(grp, 'Free kick').sum(), mins_played),
        'abp_goles_falta_dir_p90': p90(goles_falta_dir.sum(), mins_played),
        'abp_lanzador_penaltis_p90': p90(lanz_penalti, mins_played),
    }

    # ─── 5. ESPECÍFICAS DE POSICIÓN (para todos) ───────────────
    m_esp = {}

    mask_cpropio = x < 50
    mask_crival = x >= 50
    mask_z4 = x > 75
    mask_area_prop = (x < 17) & y.between(21.1, 78.9)
    mask_area_riv = (x > 83) & y.between(21.1, 78.9)
    mask_f_area = x.between(75, 83)
    mask_aparecer = mask_crival & ev_name.isin(EVENTOS_OF) & (grp['prev_Team ID'] == t_id) & \
        (grp['prev_Event Name'] == 'Pass') & (grp['prev_Pass End X'] < x)

    # Defensive 1 v 1: el qualifier está en el evento del ATACANTE con el ID del defensor
    df_1v1_ganados = df_events[df_events['Defensive 1 v 1'].astype(str) == str(pid)] \
        if 'Defensive 1 v 1' in df_events.columns else df_events.iloc[0:0]

    # Ofensivas
    crosses = grp[es_si(grp, 'Cross')]
    m_esp['of_centros_buenos_p90'] = p90((crosses['outcome'] == 1).sum(), mins_played)
    m_esp['of_centros_buenos_pct'] = pct_series((crosses['outcome'] == 1).sum(), len(crosses))
    m_esp['of_aparecer_campo_rival_p90'] = p90(mask_aparecer.sum(), mins_played)

    throwins = grp[es_si(grp, 'Throw in')]
    m_esp['of_saque_banda_efectivo_p90'] = p90((throwins['outcome'] == 1).sum(), mins_played)
    m_esp['of_saque_banda_efectivo_pct'] = pct_series((throwins['outcome'] == 1).sum(), len(throwins))
    ti_z4 = throwins[throwins['x'] > 75]
    m_esp['of_saque_banda_z4_p90'] = p90((ti_z4['outcome'] == 1).sum(), mins_played)
    m_esp['of_saque_banda_z4_pct'] = pct_series((ti_z4['outcome'] == 1).sum(), len(ti_z4))
    largo_max = to_num(throwins, 'Length').max() if not throwins.empty else 0
    m_esp['of_saque_banda_largo_max'] = float(largo_max) if pd.notna(largo_max) else 0.0

    pass_propios = passes[mask_cpropio.loc[passes.index]]
    m_esp['of_pases_propios_buenos_p90'] = p90((pass_propios['outcome'] == 1).sum(), mins_played)
    m_esp['of_pases_propios_pct'] = pct_series((pass_propios['outcome'] == 1).sum(), len(pass_propios))
    pass_rival = passes[mask_crival.loc[passes.index]]
    m_esp['of_pases_rival_buenos_p90'] = p90((pass_rival['outcome'] == 1).sum(), mins_played)
    m_esp['of_pases_rival_pct'] = pct_series((pass_rival['outcome'] == 1).sum(), len(pass_rival))

    # Pases con ventaja: la siguiente acción del equipo gana metros o centralidad
    passes_ok = passes[passes['outcome'] == 1]
    pex = passes_ok['Pass End X']
    dist_y_pase = (passes_ok['Pass End Y'] - 50).abs()
    dist_y_next_pase = (passes_ok['next_Pass End Y'] - 50).abs()
    dist_y_next_evento = (passes_ok['next_y'] - 50).abs()
    mismo_equipo = passes_ok['next_Team ID'] == t_id
    es_pase = passes_ok['next_Event Name'] == 'Pass'
    c1 = (~es_pase) & (passes_ok['next_x'] > pex)
    c2 = es_pase & (passes_ok['next_Pass End X'] > pex)
    c3 = (pex > 75) & es_pase & (dist_y_next_pase < dist_y_pase)
    c4 = (pex > 75) & (~es_pase) & (dist_y_next_evento < dist_y_pase)
    m_esp['of_pases_con_ventaja_p90'] = p90(int((mismo_equipo & (c1 | c2 | c3 | c4)).sum()), mins_played)

    horiz_mask = ((pass_x_end - x).abs() < 10) & ((pass_y_end - y).abs() > 10)
    horiz_propios = passes[(mask_cpropio & horiz_mask).loc[passes.index]]
    m_esp['of_pases_horizontales_propios_p90'] = p90((horiz_propios['outcome'] == 1).sum(), mins_played)
    m_esp['of_pases_horizontales_propios_pct'] = pct_series((horiz_propios['outcome'] == 1).sum(), len(horiz_propios))
    horiz_rival = passes[(mask_crival & horiz_mask).loc[passes.index]]
    m_esp['of_pases_horizontales_rival_p90'] = p90((horiz_rival['outcome'] == 1).sum(), mins_played)
    m_esp['of_pases_horizontales_rival_pct'] = pct_series((horiz_rival['outcome'] == 1).sum(), len(horiz_rival))

    long_pass = passes[to_num(passes, 'Length') > 30]
    m_esp['of_pases_largos_p90'] = p90((long_pass['outcome'] == 1).sum(), mins_played)
    m_esp['of_pases_largos_pct'] = pct_series((long_pass['outcome'] == 1).sum(), len(long_pass))

    tiros_f_area = tiros[mask_f_area.loc[tiros.index]]
    m_esp['of_disparos_fuera_area_p90'] = p90(len(tiros_f_area), mins_played)
    m_esp['of_goles_fuera_area_p90'] = p90((tiros_f_area['Event Name'] == 'Goal').sum(), mins_played)

    pass_recib_cen = grp[(grp['prev_Team ID'] == t_id) & (grp['prev_Event Name'] == 'Pass') &
                         grp['prev_Pass End Y'].between(21, 78) & (grp['prev_outcome'] == 1)]
    m_esp['of_pases_recibidos_carril_central_p90'] = p90(len(pass_recib_cen), mins_played)


    remates_c = tiros[(tiros['prev_Team ID'] == t_id) & (tiros['prev_Event Name'] == 'Pass') &
                      (tiros['prev_outcome'] == 1) & (tiros['prev_Cross'] == True)]  # noqa: E712
    m_esp['of_remates_centro_p90'] = p90(len(remates_c), mins_played)
    m_esp['of_goles_remate_centro_p90'] = p90((remates_c['Event Name'] == 'Goal').sum(), mins_played)

    tiros_primeras = tiros[es_si(tiros, 'First Touch')]
    m_esp['of_remates_primeras_p90'] = p90(len(tiros_primeras), mins_played)
    prev_y_t = tiros_primeras['prev_y']
    y_t = tiros_primeras['y']
    cond_cross = tiros_primeras['prev_Cross'] == True  # noqa: E712
    cond_1er = cond_cross & (((prev_y_t < 21.1) & (y_t < 50)) | ((prev_y_t > 78.9) & (y_t > 50)))
    cond_2o = cond_cross & (((prev_y_t < 21.1) & (y_t > 50)) | ((prev_y_t > 78.9) & (y_t < 50)))
    m_esp['of_remates_primeras_1er_palo_p90'] = p90(cond_1er.sum(), mins_played)
    m_esp['of_remates_primeras_2o_palo_p90'] = p90(cond_2o.sum(), mins_played)

    m_esp['of_descarga_primeras_p90'] = p90(es_si(grp, 'Flick-on').sum(), mins_played)

    jug_ind = grp[es_si(grp, 'Individual play')]
    m_esp['of_jugadas_indiv_tiro_p90'] = p90(jug_ind['Event Name'].isin(EVENTOS_TIRO).sum(), mins_played)
    m_esp['of_jugadas_indiv_gol_p90'] = p90((jug_ind['Event Name'] == 'Goal').sum(), mins_played)

    takeons_z4 = takeons[mask_z4.loc[takeons.index]]
    m_esp['of_regates_z4_p90'] = p90((takeons_z4['outcome'] == 1).sum(), mins_played)
    m_esp['of_grandes_ocasiones_p90'] = p90(es_si(grp, 'Big chance').sum(), mins_played)
    m_esp['of_1vs1_portero_p90'] = p90(es_si(grp, '1 on 1').sum(), mins_played)
    m_esp['of_goles_dentro_area_p90'] = p90(((ev_name == 'Goal') & mask_area_riv).sum(), mins_played)

    regates_port = grp[(ev_name == 'Take On') & es_si(grp, 'Take on overtake') & (outcome == 1)]
    m_esp['of_regates_hacia_porteria_p90'] = p90(len(regates_port), mins_played)
    pases_largos_z4 = passes[((to_num(grp, 'Length') > 30) & (pass_x_end > 75) & (outcome == 1)).loc[passes.index]]
    m_esp['of_pase_largo_finalizacion_p90'] = p90(len(pases_largos_z4), mins_played)


    # Defensivas — duelos 1v1 en coordenadas del atacante (x > 50 = campo propio del defensor)
    x_1v1 = df_1v1_ganados['x']
    y_1v1 = df_1v1_ganados['y']
    m_esp['def_1v1_ganados_propio_p90'] = p90((x_1v1 > 50).sum(), mins_played)
    m_esp['def_1v1_ganados_rival_p90'] = p90((x_1v1 <= 50).sum(), mins_played)
    m_esp['def_1v1_ganados_area_prop_p90'] = p90(((x_1v1 > 83) & y_1v1.between(21.1, 78.9)).sum(), mins_played)

    aer_propios = aerials[mask_cpropio.loc[aerials.index]]
    aer_propios_ok = aer_propios[aer_propios['outcome'] == 1]
    m_esp['def_aereos_ganados_propio_p90'] = p90(len(aer_propios_ok), mins_played)
    m_esp['def_aereos_ganados_propio_pct'] = pct_series(len(aer_propios_ok), len(aer_propios))
    m_esp['def_aereos_ganados_propio_cont_p90'] = p90(calc_continuidad_aereos(aer_propios_ok, df_events, t_id), mins_played)

    aer_rival = aerials[mask_crival.loc[aerials.index]]
    aer_rival_ok = aer_rival[aer_rival['outcome'] == 1]
    m_esp['def_aereos_ganados_rival_p90'] = p90(len(aer_rival_ok), mins_played)
    m_esp['def_aereos_ganados_rival_pct'] = pct_series(len(aer_rival_ok), len(aer_rival))
    m_esp['def_aereos_ganados_rival_cont_p90'] = p90(calc_continuidad_aereos(aer_rival_ok, df_events, t_id), mins_played)

    aer_area_riv = aerials[mask_area_riv.loc[aerials.index]]
    m_esp['def_aereos_ganados_area_riv_p90'] = p90((aer_area_riv['outcome'] == 1).sum(), mins_played)
    m_esp['def_aereos_ganados_area_riv_pct'] = pct_series((aer_area_riv['outcome'] == 1).sum(), len(aer_area_riv))
    aer_area_prop = aerials[mask_area_prop.loc[aerials.index]]
    m_esp['def_aereos_ganados_area_prop_p90'] = p90((aer_area_prop['outcome'] == 1).sum(), mins_played)
    m_esp['def_aereos_ganados_area_prop_pct'] = pct_series((aer_area_prop['outcome'] == 1).sum(), len(aer_area_prop))

    for sufijo, mask in [('propio', mask_cpropio), ('rival', mask_crival), ('area_prop', mask_area_prop), ('z4', mask_z4)]:
        t = tackles[mask.loc[tackles.index]]
        m_esp[f'def_entradas_{sufijo}_p90'] = p90((t['outcome'] == 1).sum(), mins_played)
        m_esp[f'def_entradas_{sufijo}_pct'] = pct_series((t['outcome'] == 1).sum(), len(t))

    clear = grp[ev_name == 'Clearance']
    m_esp['def_despejes_propio_p90'] = p90(mask_cpropio.loc[clear.index].sum(), mins_played)
    m_esp['def_despejes_area_prop_p90'] = p90(mask_area_prop.loc[clear.index].sum(), mins_played)

    recups = grp[ev_name == 'Ball recovery']
    interceps = grp[ev_name == 'Interception']
    # Recuperaciones por tercio: possWonDef3rd/Mid3rd/Att3rd de matchstats. Del eventing solo el área propia.
    m_esp['def_recup_area_prop_p90'] = p90(mask_area_prop.loc[recups.index].sum(), mins_played)
    for sufijo, mask in [('propio', mask_cpropio), ('area_prop', mask_area_prop), ('rival', mask_crival), ('z4', mask_z4)]:
        m_esp[f'def_intercep_{sufijo}_p90'] = p90(mask.loc[interceps.index].sum(), mins_played)

    m_esp['def_centros_bloqueados_p90'] = p90(es_si(grp, 'Blocked pass').sum(), mins_played)

    return {k: float(v) for k, v in {**m_comp, **m_of_gen, **m_def_gen, **m_abp_gen, **m_esp}.items()}


def calc_pases_zonas(passes: pd.DataFrame, lineups: Dict[str, Any]) -> Dict[str, Any]:
    """Pases del jugador por zona de origen (6 bandas x 4 carriles, coordenadas Opta) y relación
    con la demarcación del receptor (siguiente evento del mismo equipo, solo pases completados).
    zonas[z] = [pases, completados, suma dx, suma dy]; rel['z|dem'] = [n, sx0, sy0, sx1, sy1];
    cuadrado[dem] = [n, sx0, sy0, sx1, sy1] de los pases completados que acaban en el cuadrado."""
    zonas = [[0, 0, 0.0, 0.0] for _ in range(PZ_BANDAS * PZ_CARRILES)]
    rel: Dict[str, List[float]] = {}
    cuadrado: Dict[str, List[float]] = {}
    p = passes.dropna(subset=['x', 'y', 'Pass End X', 'Pass End Y'])
    for r in p.itertuples(index=False):
        x, y, x1, y1 = r.x, r.y, r.pend_x, r.pend_y
        z = min(int(x / 100 * PZ_BANDAS), PZ_BANDAS - 1) * PZ_CARRILES + min(int(y / 100 * PZ_CARRILES), PZ_CARRILES - 1)
        ok = r.outcome == 1
        zonas[z][0] += 1
        zonas[z][1] += int(ok)
        zonas[z][2] += x1 - x
        zonas[z][3] += y1 - y
        if not ok or r.eq_sig != r.eq:
            continue
        dem = (lineups.get(r.pid_sig) or {}).get('demarcacion')
        if not dem or r.pid_sig == r.playerId:
            continue
        acc = rel.setdefault(f'{z}|{dem}', [0, 0.0, 0.0, 0.0, 0.0])
        acc[0] += 1
        acc[1] += x; acc[2] += y; acc[3] += x1; acc[4] += y1
        if CUADRADO_X[0] <= x1 <= CUADRADO_X[1] and CUADRADO_Y[0] <= y1 <= CUADRADO_Y[1]:
            acc = cuadrado.setdefault(dem, [0, 0.0, 0.0, 0.0, 0.0])
            acc[0] += 1
            acc[1] += x; acc[2] += y; acc[3] += x1; acc[4] += y1
    return {'zonas': zonas, 'rel': rel, 'cuadrado': cuadrado}


# ──────────────────────────────────────────────────────────────
# MÉTRICAS DESDE MATCHSTATS
# ──────────────────────────────────────────────────────────────

def metricas_matchstats(st: Dict[str, float], mins_played, titular_pct, veces_capitan,
                        partidos_70m, num_dems_jugadas, dem: str = '') -> Dict[str, float]:
    """
    Métricas que salen directamente de las estadísticas oficiales de matchstats (ver docs/METRICAS_MATCHSTATS.md).
    Con eventing sustituyen al cálculo desde eventos; sin eventing son las únicas que hay.
    Las que dependen de coordenadas, secuencias, pie o modelos xG siguen saliendo solo de eventing.
    """
    g = lambda k: st.get(k, 0.0)
    tiros = g('totalScoringAtt')
    m = {
        # Comportamiento
        'comp_importancia': 1 + mins_played + partidos_70m,
        'comp_disciplina_malus': p90(g('yellowCard') + g('secondYellow') + g('redCard') + g('fouls'), mins_played),
        'comp_minutos': mins_played,
        'comp_titular_pct': titular_pct,
        'comp_capitan': veces_capitan,
        'comp_polivalencia_demarcacion': num_dems_jugadas,
        # Ofensivo
        'of_goles_p90': p90(g('goals'), mins_played),
        'of_goles_sin_penalti_p90': p90(max(g('goals') - g('attPenGoal'), 0.0), mins_played),
        'of_asistencia_gol_p90': p90(g('goalAssist'), mins_played),
        'of_asistencias_p90': p90(max(g('totalAttAssist') - g('goalAssist'), 0), mins_played),
        'of_pases_buenos_p90': p90(g('accuratePass'), mins_played),
        'of_pases_pct': pct_series(g('accuratePass'), g('totalPass')),
        'of_regates_p90': p90(g('wonContest'), mins_played),
        'of_regates_pct': pct_series(g('wonContest'), g('totalContest')),
        'of_tiros_p90': p90(tiros, mins_played),
        'of_tiros_dentro_pct': pct_series(g('ontargetScoringAtt') + g('blockedScoringAtt'), tiros),
        'of_pases_propios_buenos_p90': p90(g('accurateBackZonePass'), mins_played),
        'of_pases_propios_pct': pct_series(g('accurateBackZonePass'), g('totalBackZonePass')),
        'of_pases_rival_buenos_p90': p90(g('accurateFwdZonePass'), mins_played),
        'of_pases_rival_pct': pct_series(g('accurateFwdZonePass'), g('totalFwdZonePass')),
        'of_pases_largos_p90': p90(g('accurateLongBalls'), mins_played),
        'of_pases_largos_pct': pct_series(g('accurateLongBalls'), g('totalLongBalls')),
        'of_centros_buenos_p90': p90(g('accurateCross'), mins_played),
        'of_centros_buenos_pct': pct_series(g('accurateCross'), g('totalCross')),
        'of_saque_banda_efectivo_p90': p90(g('accurateThrows'), mins_played),
        'of_saque_banda_efectivo_pct': pct_series(g('accurateThrows'), g('totalThrows')),
        'of_disparos_fuera_area_p90': p90(g('attemptsObox'), mins_played),
        'of_goles_dentro_area_p90': p90(g('attIboxGoal'), mins_played),
        'of_goles_fuera_area_p90': p90(g('attOboxGoal'), mins_played),
        'of_grandes_ocasiones_p90': p90(g('bigChanceScored') + g('bigChanceMissed'), mins_played),
        'of_1vs1_portero_p90': p90(g('attOneOnOne'), mins_played),
        'of_tiros_puerta_area_p90': p90(g('attIboxTarget'), mins_played),
        # Defensivo
        'def_aereos_ganados_p90': p90(g('aerialWon'), mins_played),
        'def_aereos_ganados_pct': pct_series(g('aerialWon'), g('aerialWon') + g('aerialLost')),
        'def_entradas_p90': p90(g('wonTackle'), mins_played),
        'def_entradas_pct': pct_series(g('wonTackle'), g('totalTackle')),
        'def_intercepciones_p90': p90(g('interception'), mins_played),
        'def_recuperaciones_p90': p90(g('ballRecovery'), mins_played),
        # ABP
        'abp_lanzador_corner_p90': p90(g('cornerTaken'), mins_played),
    }

    # Estadísticas detalladas (matchstats con detailed=yes y cobertura alta). Opta omite los valores a 0, así que
    # la marca de que el partido las trae es 'touches' (toda jugadora con minutos tiene toques). Sin ellas → no se
    # añaden (quedan sin dato, no a 0). Sustituyen a las aproximaciones que antes se calculaban desde el eventing.
    if 'touches' in st:
        pct_nan = lambda num, den: float(num / den * 100) if den > 0 else np.nan
        m.update({
            'of_toques_p90': p90(g('touches'), mins_played),
            'of_toques_area_rival_p90': p90(g('touchesInOppBox'), mins_played),
            'of_toques_ultimo_tercio_p90': p90(g('touchesInFinalThird'), mins_played),
            'of_entradas_ultimo_tercio_p90': p90(g('finalThirdEntries'), mins_played),
            'of_pases_ultimo_tercio_p90': p90(g('successfulFinalThirdPasses'), mins_played),
            'of_pases_ultimo_tercio_pct': pct_nan(g('successfulFinalThirdPasses'), g('totalFinalThirdPasses')),
            'of_entradas_area_p90': p90(g('penAreaEntries') or g('successfulPenAreaEntries'), mins_played),
            'of_entradas_area_pct': pct_nan(g('successfulPenAreaEntries'), g('penAreaEntries')),
            'of_conducciones_progresivas_p90': p90(g('progressiveCarries'), mins_played),
            'of_pases_filtrados_p90': p90(g('accurateThroughBall'), mins_played),
            'of_pases_filtrados_pct': pct_nan(g('accurateThroughBall'), g('totalThroughBall')),
            'of_grandes_ocasiones_creadas_p90': p90(g('bigChanceCreated'), mins_played),
            'of_perdidas_p90': p90(g('possLostAll'), mins_played),
            'of_faltas_recibidas_p90': p90(g('wasFouled'), mins_played),
            'of_remates_cabeza_p90': p90(g('attHdTotal'), mins_played),
            'of_goles_cabeza_p90': p90(g('attHdGoal'), mins_played),
            'of_descarga_primeras_p90': p90(g('accurateLayoffs') + g('accurateFlickOn'), mins_played),
            'def_duelos_ganados_p90': p90(g('duelWon'), mins_played),
            'def_duelos_ganados_pct': pct_nan(g('duelWon'), g('duelWon') + g('duelLost')),
            'def_recup_tercio_propio_p90': p90(g('possWonDef3rd'), mins_played),
            'def_recup_tercio_medio_p90': p90(g('possWonMid3rd'), mins_played),
            'def_recup_tercio_rival_p90': p90(g('possWonAtt3rd'), mins_played),
            'def_despejes_p90': p90(g('effectiveClearance'), mins_played),
            'def_bloqueos_p90': p90(g('outfielderBlock'), mins_played),
            'def_centros_bloqueados_p90': p90(g('blockedPass'), mins_played),
            'abp_lanzador_corner_pct': pct_nan(g('accurateCornersIntobox'), g('totalCornersIntobox')),
        })

        if 'expectedGoals' in st:
            m['of_xG_p90'] = p90(g('expectedGoals'), mins_played)
        if 'expectedAssists' in st:
            m['of_xA_p90'] = p90(g('expectedAssists'), mins_played)

    # Portería (específicas de portera, desde matchstats). Solo para porteras: Opta da goalsConceded y
    # cleanSheet a todas las jugadoras en el campo y no deben puntuar como portería a las de campo.
    if dem == 'Portero':
        # % sin intentos en el partido = NaN (no 0): la media de temporada ignora esos partidos
        pct_nan = lambda num, den: float(num / den * 100) if den > 0 else np.nan
        m.update({
            # Paradas
            'def_paradas_p90': p90(g('saves'), mins_played),
            'def_goles_encajados_p90': p90(g('goalsConceded'), mins_played),
            'def_paradas_pct': pct_nan(g('saves'), g('saves') + g('goalsConceded')),
            'def_paradas_area_p90': p90(g('savedIbox'), mins_played),
            'def_paradas_fuera_area_p90': p90(g('savedObox'), mins_played),
            'def_paradas_ocasiones_claras_p90': p90(g('bigChanceSaves'), mins_played),
            'def_porteria_cero_pct': 100.0 if g('cleanSheet') > 0 else 0.0,
            'def_penaltis_parados_pct': pct_nan(g('penaltySave'), g('penaltyFaced')),
            'def_errores_p90': p90(g('errorLeadToGoal') + g('errorLeadToShot'), mins_played),
            # Dominio del área
            'def_blocajes_p90': p90(g('goodHighClaim'), mins_played),
            'def_blocajes_pct': pct_nan(g('goodHighClaim'), g('totalHighClaim')),
            'def_centros_no_blocados_p90': p90(g('crossNotClaimed'), mins_played),
            'def_despejes_punos_p90': p90(g('punches'), mins_played),
            'def_salidas_libero_p90': p90(g('accurateKeeperSweeper') or g('totalKeeperSweeper'), mins_played),
            'def_salidas_libero_pct': pct_nan(g('accurateKeeperSweeper'), g('totalKeeperSweeper')),
            # Distribución
            'of_saques_puerta_pct': pct_nan(g('accurateGoalKicks'), g('goalKicks')),
            'of_saques_mano_p90': p90(g('accurateKeeperThrows'), mins_played),
            'of_saques_mano_pct': pct_nan(g('accurateKeeperThrows'), g('keeperThrows')),
            'of_envios_largos_p90': p90(g('accurateLaunches'), mins_played),
            'of_envios_largos_pct': pct_nan(g('accurateLaunches'), g('totalLaunches')),
        })
        if 'expectedGoalsConceded' in st:
            m['def_xg_contra_p90'] = p90(g('expectedGoalsConceded'), mins_played)
            m['def_goles_menos_xgc_p90'] = p90(g('goalsConceded') - g('expectedGoalsConceded'), mins_played)

    return {k: float(v) for k, v in m.items()}


def metricas_xg_contra(df: pd.DataFrame, team_id: Any, mins_played: float, st: Dict[str, float]) -> Dict[str, float]:
    """Portera: xG de los tiros a puerta del rival (Attempt Saved / Goal, evitando inflar con tiros fuera o
    bloqueados) y goles encajados − xG en contra (negativo = evita goles). Con < 90' se escala por minutos."""
    if 'Expected Goals' not in df.columns or not mins_played:
        return {}
    rival_on_target = (df['Team ID'].astype(str) != str(team_id)) & df['Event Name'].isin(['Attempt Saved', 'Goal'])
    xgc = float(df.loc[rival_on_target, 'Expected Goals'].fillna(0).sum())
    xgc *= min(mins_played / 90.0, 1.0)
    return {'def_xg_contra_p90': p90(xgc, mins_played),
            'def_goles_menos_xgc_p90': p90(float(st.get('goalsConceded', 0.0)) - xgc, mins_played)}


# ──────────────────────────────────────────────────────────────
# MOTOR POR PARTIDO
# ──────────────────────────────────────────────────────────────

class MetricsEngine:
    """Calcula las métricas de todos los jugadores de un partido a partir de matchevent + matchstats."""

    def __init__(self, match_events: Optional[Dict[str, Any]], match_stats: Optional[Dict[str, Any]] = None):
        self.match_events = match_events
        self.match_stats = match_stats
        self.match_id = ((match_events or match_stats or {}).get('matchInfo') or {}).get('id')

    def process_match(self, dems_temporada: Optional[Dict[str, int]] = None) -> List[Dict[str, Any]]:
        """
        Devuelve una fila por jugador con demarcación conocida y minutos > 0:
        estadísticas oficiales (para columnas nativas) + `metrics` (dict de métricas brutas).
        `dems_temporada`: nº de demarcaciones distintas por jugador en la temporada (polivalencia).
        """
        df_raw = events_to_dataframe(self.match_events) if self.match_events else pd.DataFrame()
        if df_raw.empty:
            return self._process_solo_matchstats(dems_temporada)
        lineups = build_lineups(self.match_stats, df_raw)
        df = prep_eventos_secuenciales(aplicar_xg_xa(df_raw))
        df_pases = df[df['Event Name'] == 'Pass'].assign(
            pend_x=df['Pass End X'], pend_y=df['Pass End Y'], eq=df['Team ID'],
            eq_sig=df['Team ID'].shift(-1), pid_sig=df['playerId'].shift(-1))

        rows = []
        for pid, info in lineups.items():
            dem = info['demarcacion']
            if not dem:
                continue
            mins = float(info['minutes'])
            grp = df[df['playerId'] == pid]
            st = info['stats']
            metrics = calc_metricas_jugador(
                grp, df, pid, info['team_id'], mins,
                100.0 if info['is_starter'] else 0.0,
                1 if info['is_captain'] else 0,
                1, 1 if mins >= 70 else 0,
                dem, (dems_temporada or {}).get(pid, 1),
            )
            if st:
                # Las que da Opta en matchstats mandan sobre el cálculo desde eventos
                metrics.update(metricas_matchstats(st, mins, 100.0 if info['is_starter'] else 0.0,
                                                   1 if info['is_captain'] else 0, 1 if mins >= 70 else 0,
                                                   (dems_temporada or {}).get(pid, 1), dem))
            if dem == 'Portero':
                metrics.update(metricas_xg_contra(df, info['team_id'], mins, st))
            passes = grp[grp['Event Name'] == 'Pass']
            loc = grp[(grp['x'] > 0) & (grp['y'] > 0)]
            heat = np.zeros((HM_ROWS, HM_COLS), dtype=int)
            np.add.at(heat, (np.minimum((loc['y'] / 100 * HM_ROWS).astype(int), HM_ROWS - 1),
                             np.minimum((loc['x'] / 100 * HM_COLS).astype(int), HM_COLS - 1)), 1)
            prog = passes[(passes['outcome'] == 1) & (passes['Pass End X'] - passes['x'] > 15) &
                          ((passes['Pass End Y'] - passes['y']).abs() <= 20)]
            passes_total = int(st.get('totalPass', len(passes)))
            passes_ok = int(st.get('accuratePass', (passes['outcome'] == 1).sum()))
            rows.append({
                'match_id': self.match_id,
                'player_id': pid,
                'player_name': info['match_name'],
                'first_name': info['first_name'],
                'last_name': info['last_name'],
                'shirt_number': info['shirt_number'],
                'team_id': info['team_id'],
                'formation': info['formation'],
                'slot': info['slot'],
                'demarcacion': dem,
                'grupo_demarcacion': info['grupo_demarcacion'],
                'minutes_played': int(round(mins)),
                'is_starter': bool(info['is_starter']),
                'is_captain': bool(info['is_captain']),
                'goals': int(st.get('goals', 0)),
                'assists': int(st.get('goalAssist', 0)),
                'xg': round(float(grp['Expected Goals'].sum()), 3),
                'xa': round(float(grp['Expected Assist'].sum()), 3),
                'xca': round(calc_xca(grp), 3),
                'passes_completed': passes_ok,
                'passes_total': passes_total,
                'passes_pct': round(passes_ok / passes_total * 100, 2) if passes_total else 0.0,
                'progressive_passes': int(len(prog)),
                'tackles_won': int(st.get('wonTackle', 0)),
                'tackles_total': int(st.get('totalTackle', 0)),
                'interceptions': int(st.get('interception', st.get('interceptionWon', 0))),
                'recoveries': int(st.get('ballRecovery', 0)),
                'aerials_won': int(st.get('aerialWon', 0)),
                'aerials_total': int(st.get('aerialWon', 0) + st.get('aerialLost', 0)),
                'takeons_successful': int(st.get('wonContest', 0)),
                'takeons_total': int(st.get('totalContest', 0)),
                'fouls': int(st.get('fouls', 0)),
                'yellow_cards': int(st.get('yellowCard', 0)),
                'red_cards': int(st.get('redCard', 0) + st.get('secondYellow', 0)),
                'metrics': metrics,
                'heatmap': heat.ravel().tolist(),
                'pases_json': json.dumps(calc_pases_zonas(df_pases[df_pases['playerId'] == pid], lineups)),
            })
        return rows

    def _process_solo_matchstats(self, dems_temporada: Optional[Dict[str, int]] = None) -> List[Dict[str, Any]]:
        """Partidos sin eventing: solo las métricas de matchstats, sin xG/xA/xCA, campograma ni mapa de pases."""
        lineups = build_lineups(self.match_stats, pd.DataFrame())
        rows = []
        for pid, info in lineups.items():
            dem, st = info['demarcacion'], info['stats']
            if not dem or not st:
                continue
            mins = float(info['minutes'])
            starter = bool(info['is_starter'])
            metrics = metricas_matchstats(st, mins, 100.0 if starter else 0.0, 1 if info['is_captain'] else 0,
                                          1 if mins >= 70 else 0, (dems_temporada or {}).get(pid, 1), dem)
            passes_total, passes_ok = int(st.get('totalPass', 0)), int(st.get('accuratePass', 0))
            rows.append({
                'match_id': self.match_id,
                'player_id': pid,
                'player_name': info['match_name'],
                'first_name': info['first_name'],
                'last_name': info['last_name'],
                'shirt_number': info['shirt_number'],
                'team_id': info['team_id'],
                'formation': info['formation'],
                'slot': info['slot'],
                'demarcacion': dem,
                'grupo_demarcacion': info['grupo_demarcacion'],
                'minutes_played': int(round(mins)),
                'is_starter': starter,
                'is_captain': bool(info['is_captain']),
                'goals': int(st.get('goals', 0)),
                'assists': int(st.get('goalAssist', 0)),
                'xg': 0.0, 'xa': 0.0, 'xca': 0.0,
                'passes_completed': passes_ok,
                'passes_total': passes_total,
                'passes_pct': round(passes_ok / passes_total * 100, 2) if passes_total else 0.0,
                'progressive_passes': 0,
                'tackles_won': int(st.get('wonTackle', 0)),
                'tackles_total': int(st.get('totalTackle', 0)),
                'interceptions': int(st.get('interception', st.get('interceptionWon', 0))),
                'recoveries': int(st.get('ballRecovery', 0)),
                'aerials_won': int(st.get('aerialWon', 0)),
                'aerials_total': int(st.get('aerialWon', 0) + st.get('aerialLost', 0)),
                'takeons_successful': int(st.get('wonContest', 0)),
                'takeons_total': int(st.get('totalContest', 0)),
                'fouls': int(st.get('fouls', 0)),
                'yellow_cards': int(st.get('yellowCard', 0)),
                'red_cards': int(st.get('redCard', 0) + st.get('secondYellow', 0)),
                'metrics': metrics,
                'heatmap': [0] * (HM_ROWS * HM_COLS),
                'pases_json': None,  # sin coordenadas: no hay mapa de pases
            })
        return rows
