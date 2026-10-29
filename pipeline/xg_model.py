"""
pipeline/xg_model.py
Modelos de Expected Goals (xG) y Expected Assist (xA) entrenados en Debrecen_app con datos NB I
(GradientBoostingRegressor, scikit-learn 1.8). Se aplican sobre los eventos de matchevent,
que en la clave pública no traen los qualifiers oficiales 318/321.

Notas de fidelidad con el entrenamiento original:
- Los flags binarios se comparaban con 'Si' (sin tilde) mientras que los datos usaban 'Sí',
  así que el modelo se entrenó con todos esos flags a 0. Se reproduce igual para no
  desplazar la distribución de entrada (tienen importancia 0 en el modelo).
- El modelo xA se entrenó SOLO con pases que acabaron en remate (xA > 0). Por eso aquí se
  aplica solo a pases con qualifier 210 "Assist" (pase clave); aplicarlo a todos los pases
  inflaría el xA de cualquier jugador con mucho volumen de pase.
- Los penaltis reciben el valor estándar 0.76 (el modelo no distingue penaltis).
"""

import logging
import pickle
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

MODELOS_DIR = Path(__file__).parent / 'modelos'
XG_PENALTI = 0.76
EVENTOS_DISPARO = ['Attempt Saved', 'Miss', 'Goal', 'Post']

_MODELOS = None


def _to_num(df, col):
    if col not in df.columns:
        return pd.Series(np.nan, index=df.index)
    return pd.to_numeric(df[col].replace(['No', '', 'nan'], np.nan), errors='coerce')


def _flag(df, col):
    # Réplica exacta del entrenamiento (ver docstring del módulo)
    return (df.get(col, pd.Series('No', index=df.index)) == 'Si').astype(int)


def extraer_features_xa(df):
    f = pd.DataFrame(index=df.index)
    f['x'] = _to_num(df, 'x')
    f['y'] = _to_num(df, 'y')
    f['pass_end_x'] = _to_num(df, 'Pass End X')
    f['pass_end_y'] = _to_num(df, 'Pass End Y')
    f['prog_x'] = f['pass_end_x'] - f['x']
    f['prog_y'] = (f['pass_end_y'] - f['y']).abs()
    f['distancia'] = np.sqrt((f['pass_end_x'] - f['x']) ** 2 + (f['pass_end_y'] - f['y']) ** 2)
    f['length'] = _to_num(df, 'Length')
    for name, col in [('cross', 'Cross'), ('through_ball', 'Through ball'), ('long_ball', 'Long ball'),
                      ('switch', 'Switch of play'), ('corner', 'Corner taken'), ('free_kick', 'Free kick taken'),
                      ('floated', 'Floated cross'), ('driven', 'Driven cross'), ('chipped', 'Chipped'),
                      ('headed', 'Head pass')]:
        f[name] = _flag(df, col)
    f['zona_ultima_tercera'] = (f['x'] > 66.6).astype(int)
    f['zona_central'] = f['y'].between(33.3, 66.6).astype(int)
    f['zona_banda_izq'] = (f['y'] < 33.3).astype(int)
    f['zona_banda_der'] = (f['y'] > 66.6).astype(int)
    f['destino_area'] = ((f['pass_end_x'] > 83) & f['pass_end_y'].between(21.1, 78.9)).astype(int)
    f['outcome'] = _to_num(df, 'outcome')
    return f.fillna(0)


def extraer_features_xg(df):
    f = pd.DataFrame(index=df.index)
    f['x'] = _to_num(df, 'x')
    f['y'] = _to_num(df, 'y')
    f['dist_porteria'] = np.sqrt((100 - f['x']) ** 2 + (50 - f['y']) ** 2)
    f['angulo'] = np.arctan2((50 - f['y']).abs(), 100 - f['x']) * 180 / np.pi
    for name, col in [('head', 'Head'), ('left_foot', 'Left footed'), ('right_foot', 'Right footed'),
                      ('other', 'Other body part'), ('big_chance', 'Big chance'), ('fast_break', 'Fast break'),
                      ('from_corner', 'From corner'), ('from_free_kick', 'Free kick'), ('penalty', 'Penalty'),
                      ('first_touch', 'First Touch'), ('volley', 'Volley')]:
        f[name] = _flag(df, col)
    f['dentro_area'] = ((f['x'] > 83) & f['y'].between(21.1, 78.9)).astype(int)
    f['seis_yardas'] = ((f['x'] > 94) & f['y'].between(35.5, 64.5)).astype(int)
    f['miss'] = (df['Event Name'] == 'Miss').astype(int)
    f['saved'] = (df['Event Name'] == 'Attempt Saved').astype(int)
    f['post'] = (df['Event Name'] == 'Post').astype(int)
    f['goal'] = (df['Event Name'] == 'Goal').astype(int)
    return f.fillna(0)


def cargar_modelos():
    global _MODELOS
    if _MODELOS is None:
        modelos = {}
        for nombre in ('xa', 'xg'):
            path = MODELOS_DIR / f'modelo_{nombre}.pkl'
            if path.exists():
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore')
                    with open(path, 'rb') as fh:
                        modelos[nombre] = pickle.load(fh)
            else:
                logger.warning(f"No se encuentra {path}: xG/xA quedarán a 0")
        _MODELOS = modelos
    return _MODELOS


def aplicar_xg_xa(df: pd.DataFrame) -> pd.DataFrame:
    """Añade columnas numéricas 'Expected Goals' y 'Expected Assist' al DataFrame de eventos."""
    df = df.copy()
    df['Expected Goals'] = 0.0
    df['Expected Assist'] = 0.0
    if df.empty:
        return df
    modelos = cargar_modelos()

    mask_tiros = df['Event Name'].isin(EVENTOS_DISPARO)
    if 'xg' in modelos and mask_tiros.any():
        pred = modelos['xg'].predict(extraer_features_xg(df[mask_tiros]))
        df.loc[mask_tiros, 'Expected Goals'] = np.clip(pred, 0.0, 0.99)
        mask_pen = mask_tiros & (df['Penalty'] != 'No')
        df.loc[mask_pen, 'Expected Goals'] = XG_PENALTI

    mask_clave = (df['Event Name'] == 'Pass') & (df['Assist'] != 'No')
    if 'xa' in modelos and mask_clave.any():
        pred = modelos['xa'].predict(extraer_features_xa(df[mask_clave]))
        df.loc[mask_clave, 'Expected Assist'] = np.clip(pred, 0.0, 0.99)
    return df
