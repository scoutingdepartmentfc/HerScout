"""
pipeline/perfiles.py
Calcula los perfiles tácticos por posición según `pipeline/perfiles_v4.json`
(extraído de `seleccion_metricas_perfiles_v4.xlsx`):
  puntuación_perfil = sum(percentil_en_liga_y_posicion * peso)
  (en "Menos es mejor", el percentil se invierte: 100 - percentil).
"""

import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

_DATA_PATH = Path(__file__).with_name("perfiles_v4.json")
with _DATA_PATH.open("r", encoding="utf-8") as _f:
    PERFILES_V4: Dict[str, Dict[str, Any]] = json.load(_f)

# Mapeo de demarcación HerScout -> clave de posición en perfiles_v4.json
DEM_TO_V4_POS: Dict[str, str] = {
    "Portero": "GK",
    "Lateral Derecho": "RB / LB",
    "Lateral Izquierdo": "RB / LB",
    "Central Derecho": "CB",
    "Central Izquierdo": "CB",
    "Mediocentro Defensivo": "DMF",
    "Mediocentro": "MF",
    "Mediapunta": "OMF",
    "Extremo Derecho": "WIN",
    "Extremo Izquierdo": "WIN",
    "Delantero": "CF",
}

# Mapeo de nombres de métrica Opta/v4 -> columna en df_temp (metrics_engine / wyscout_excel)
V4_METRIC_TO_COL: Dict[str, str] = {
    "savePct": "def_paradas_pct",
    "saves": "def_paradas_p90",
    "goalsConceded": "def_goles_encajados_p90",
    "goalsPrevented": "def_goles_menos_xgc_p90",
    "accuratePass": "of_pases_buenos_p90",
    "accuratePassPct": "of_pases_pct",
    "accurateLaunches": "of_envios_largos_p90",
    "accurateLongBalls": "of_pases_largos_p90",
    "accurateLongBallsPct": "of_pases_largos_pct",
    "accurateKeeperThrows": "of_saques_mano_p90",
    "accurateKeeperSweeper": "def_salidas_libero_p90",
    "keeperSweeperPct": "def_salidas_libero_pct",
    "goalKicks": "of_saques_puerta_pct",
    "cleanSheets": "def_porteria_cero_pct",
    "goals": "of_goles_p90",
    "expectedGoals": "of_xG_p90",
    "ontargetScoringAtt": "of_tiros_p90",
    "totalScoringAtt": "of_tiros_p90",
    "shotConversionPct": "of_goles_menos_xg_p90",
    "goalAssist": "of_asistencias_p90",
    "expectedAssists": "of_xA_p90",
    "bigChanceCreated": "of_grandes_ocasiones_creadas_p90",
    "keyPasses": "of_pases_con_ventaja_p90",
    "attAssist": "of_pases_con_ventaja_p90",
    "accurateCross": "of_centros_buenos_p90",
    "accurateCrossPct": "of_centros_buenos_pct",
    "accurateThroughBall": "of_pases_filtrados_p90",
    "accurateThroughBallPct": "of_pases_filtrados_pct",
    "accurateFwdZonePass": "of_pases_ultimo_tercio_p90",
    "accurateFwdZonePassPct": "of_pases_ultimo_tercio_pct",
    "accurateMidThirdPassPct": "of_pases_propios_pct",
    "accurateFinalThirdPassPct": "of_pases_ultimo_tercio_pct",
    "progressivePasses": "of_progresivos_p90",
    "progressiveCarries": "of_conducciones_progresivas_p90",
    "wonContest": "of_regates_p90",
    "wonContestPct": "of_regates_pct",
    "touchesInBox": "of_toques_area_rival_p90",
    "touches": "of_toques_p90",
    "foulsWon": "of_faltas_recibidas_p90",
    "wonTackle": "def_entradas_p90",
    "totalTackle": "def_entradas_p90",
    "tacklePct": "def_entradas_pct",
    "interception": "def_intercepciones_p90",
    "ballRecovery": "def_recuperaciones_p90",
    "aerialWon": "def_aereos_ganados_p90",
    "aerialWonPct": "def_aereos_ganados_pct",
    "duelWon": "def_duelos_ganados_p90",
    "duelWonPct": "def_duelos_ganados_pct",
    "blockedScoringAtt": "def_bloqueos_p90",
    "effectiveClearance": "def_despejes_p90",
    "dispossessed": "of_perdidas_p90",
    "fouls": "comp_disciplina_malus",
}


def calcular_perfiles_v4(df_temp: pd.DataFrame) -> Dict[Any, Dict[str, Any]]:
    """
    Para cada fila de `df_temp` devuelve:
      {'perfil': nombre_perfil_ganador, 'perfiles': {perfil: puntuacion_0_100}}
    calculado con el percentil de cada métrica dentro de su posición en la liga.
    """
    out: Dict[Any, Dict[str, Any]] = {}
    if df_temp.empty or "demarcacion" not in df_temp.columns:
        return out

    v4_pos = df_temp["demarcacion"].map(DEM_TO_V4_POS)
    for pos_key, profs in PERFILES_V4.items():
        mask = v4_pos == pos_key
        if not mask.any():
            continue
        sub_idx = df_temp.index[mask]
        # Percentiles 0-100 por columna presente dentro del grupo de posición
        needed_cols = {
            V4_METRIC_TO_COL[m["metric"]]
            for pdata in profs.values()
            for m in pdata["metrics"]
            if m["metric"] in V4_METRIC_TO_COL and V4_METRIC_TO_COL[m["metric"]] in df_temp.columns
        }
        pcts: Dict[str, pd.Series] = {}
        for col in needed_cols:
            s = pd.to_numeric(df_temp.loc[sub_idx, col], errors="coerce")
            pcts[col] = s.rank(pct=True, method="average") * 100.0

        for idx in sub_idx:
            scores: Dict[str, float] = {}
            for prof_name, pdata in profs.items():
                total_w = 0.0
                weighted_sum = 0.0
                for m in pdata["metrics"]:
                    col = V4_METRIC_TO_COL.get(m["metric"])
                    if not col or col not in pcts:
                        continue
                    val = pcts[col].get(idx)
                    if pd.isna(val):
                        continue
                    p_val = (100.0 - float(val)) if m["invert"] else float(val)
                    w = float(m["weight"])
                    weighted_sum += p_val * w
                    total_w += w
                if total_w > 0:
                    scores[prof_name] = round(weighted_sum / total_w, 1)
            if scores:
                best = max(scores.items(), key=lambda kv: kv[1])[0]
                out[idx] = {"perfil": best, "perfiles": scores}
    return out
