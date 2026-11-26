"""
pipeline/categorias.py
Jerarquía Categoría → Subcategoría → Métricas y pesos de la nota global por grupo de demarcación.
Es la fuente única: src/features/scouting/metricasJerarquia.ts la replica (mismos ids y claves).

Las claves son las de metrics_engine.py; las `disp_*` se calculan en scoring.py con los datos de temporada.
Las métricas solo de eventing no existen en temporadas de solo matchstats: la subcategoría se calcula con
las que haya y, si no queda ninguna, queda "sin datos" (no puntúa ni a favor ni en contra).
"""

from typing import Dict, List, Tuple

Jerarquia = List[Tuple[str, str, List[Tuple[str, str, List[str]]]]]

DISPONIBILIDAD = ('disponibilidad', 'Disponibilidad', [
    ('participacion', 'Participación', [
        'disp_partidos', 'comp_minutos', 'disp_minutos_equipo_pct', 'comp_titular_pct']),
    ('fiabilidad', 'Fiabilidad', [
        'comp_regularidad', 'comp_regularidad_min90', 'comp_capitan', 'comp_disciplina_malus',
        'comp_polivalencia_demarcacion', 'of_polivalencia', 'of_regular_polivalencia']),
    ])

# Jugadoras de campo
JERARQUIA: Jerarquia = [
    ('ataque', 'Ataque', [
        ('finalizacion', 'Finalización', [
            'of_goles_p90', 'of_goles_sin_penalti_p90', 'of_goles_dentro_area_p90', 'of_goles_fuera_area_p90',
            'of_xG_p90', 'of_xg_sin_penalti_p90', 'of_tiros_p90', 'of_tiros_dentro_pct', 'of_disparos_fuera_area_p90',
            'of_grandes_ocasiones_p90', 'of_1vs1_portero_p90', 'of_remates_primeras_p90',
            'of_remates_primeras_1er_palo_p90', 'of_remates_primeras_2o_palo_p90', 'of_remates_centro_p90',
            'of_goles_remate_centro_p90', 'of_toques_area_rival_p90', 'of_remates_cabeza_p90', 'of_goles_cabeza_p90',
            'of_goles_menos_xg_p90', 'of_tiros_puerta_area_p90']),
        ('creacion', 'Creación', [
            'of_asistencias_p90', 'of_asistencia_gol_p90', 'of_xA_p90', 'of_xCA_p90', 'of_pases_con_ventaja_p90',
            'of_pases_filtrados_p90', 'of_pases_filtrados_pct', 'of_pase_largo_finalizacion_p90',
            'of_entradas_area_p90', 'of_entradas_area_pct', 'of_grandes_ocasiones_creadas_p90',
            'of_centros_buenos_p90', 'of_centros_buenos_pct']),
    ]),
    ('construccion', 'Construcción', [
        ('pase', 'Pase', [
            'of_pases_buenos_p90', 'of_pases_pct', 'of_pases_propios_buenos_p90', 'of_pases_propios_pct',
            'of_pases_rival_buenos_p90', 'of_pases_rival_pct', 'of_pases_largos_p90', 'of_pases_largos_pct',
            'of_pases_horizontales_propios_p90', 'of_pases_horizontales_propios_pct',
            'of_pases_horizontales_rival_p90', 'of_pases_horizontales_rival_pct', 'of_toques_p90',
            'of_perdidas_p90', 'of_ambidiestro_pct', 'of_descarga_primeras_p90']),
        ('progresion', 'Progresión', [
            'of_progresivos_p90', 'of_progresivos_pct', 'of_prog_cen_p90', 'of_prog_cen_pct', 'of_cambios_ori_p90',
            'of_cambios_ori_pct', 'of_conducciones_progresivas_p90', 'of_pases_ultimo_tercio_p90',
            'of_pases_ultimo_tercio_pct', 'of_toques_ultimo_tercio_p90', 'of_pases_recibidos_carril_central_p90',
            'of_aparecer_campo_rival_p90', 'of_entradas_ultimo_tercio_p90']),
        ('regate', 'Regate', [
            'of_regates_p90', 'of_regates_pct', 'of_regates_z4_p90', 'of_regates_hacia_porteria_p90',
            'of_jugadas_indiv_gol_p90', 'of_jugadas_indiv_tiro_p90', 'of_faltas_recibidas_p90']),
    ]),
    ('defensa', 'Defensa', [
        ('recuperacion', 'Recuperación', [
            'def_recuperaciones_p90', 'def_recup_tercio_propio_p90', 'def_recup_tercio_medio_p90',
            'def_recup_tercio_rival_p90', 'def_recup_area_prop_p90', 'def_intercepciones_p90', 'def_intercep_propio_p90', 'def_intercep_rival_p90',
            'def_intercep_z4_p90', 'def_intercep_area_prop_p90', 'def_centros_bloqueados_p90']),
        ('duelos', 'Duelos', [
            'def_duelos_ganados_p90', 'def_duelos_ganados_pct', 'def_bloqueos_p90',
            'def_entradas_p90', 'def_entradas_pct', 'def_entradas_propio_p90', 'def_entradas_propio_pct',
            'def_entradas_rival_p90', 'def_entradas_rival_pct', 'def_entradas_z4_p90', 'def_entradas_z4_pct',
            'def_entradas_area_prop_p90', 'def_entradas_area_prop_pct', 'def_1v1_ganados_propio_p90',
            'def_1v1_ganados_rival_p90', 'def_1v1_ganados_area_prop_p90']),
        ('aereo', 'Juego aéreo', [
            'def_aereos_ganados_p90', 'def_aereos_ganados_pct', 'def_aereos_continuidad_p90', 'def_despejes_p90',
            'def_aereos_ganados_propio_p90', 'def_aereos_ganados_propio_pct', 'def_aereos_ganados_propio_cont_p90',
            'def_aereos_ganados_rival_p90', 'def_aereos_ganados_rival_pct', 'def_aereos_ganados_rival_cont_p90',
            'def_aereos_ganados_area_prop_p90', 'def_aereos_ganados_area_prop_pct', 'def_aereos_ganados_area_riv_p90',
            'def_aereos_ganados_area_riv_pct', 'def_despejes_propio_p90', 'def_despejes_area_prop_p90']),
    ]),
    ('balon_parado', 'Balón parado', [
        ('lanzamiento', 'Lanzamiento', [
            'abp_lanzador_corner_p90', 'abp_lanzador_corner_pct', 'abp_faltas_lejanas_p90', 'abp_faltas_lejanas_pct',
            'abp_lanzador_faltas_dir_p90', 'abp_goles_falta_dir_p90', 'abp_lanzador_penaltis_p90',
            'of_saque_banda_efectivo_p90', 'of_saque_banda_efectivo_pct', 'of_saque_banda_z4_p90',
            'of_saque_banda_z4_pct', 'of_saque_banda_largo_max']),
        ('remate', 'Remate', ['abp_remates_corner_p90', 'abp_remates_faltas_p90']),
    ]),
    DISPONIBILIDAD,
]

# Porteras: métricas propias. Mismos ids de categoría (columnas nota_*) pero con su contenido:
# defensa = Portería, construccion = Distribución. Sin ataque ni balón parado (no puntúan).
JERARQUIA_PORTEROS: Jerarquia = [
    ('defensa', 'Portería', [
        ('paradas', 'Paradas', [
            'def_paradas_p90', 'def_paradas_pct', 'def_paradas_area_p90', 'def_paradas_fuera_area_p90',
            'def_paradas_ocasiones_claras_p90', 'def_goles_encajados_p90', 'def_porteria_cero_pct',
            'def_penaltis_parados_pct', 'def_errores_p90', 'def_goles_menos_xgc_p90']),
        ('dominio_area', 'Dominio del área', [
            'def_blocajes_p90', 'def_blocajes_pct', 'def_centros_no_blocados_p90', 'def_despejes_punos_p90',
            'def_salidas_libero_p90', 'def_salidas_libero_pct']),
    ]),
    ('construccion', 'Distribución', [
        ('juego_pie', 'Juego con el pie', [
            'of_pases_buenos_p90', 'of_pases_pct', 'of_pases_largos_p90', 'of_pases_largos_pct',
            'of_saques_puerta_pct', 'of_envios_largos_p90', 'of_envios_largos_pct', 'of_progresivos_p90',
            'of_toques_p90']),
        ('juego_mano', 'Juego con la mano', ['of_saques_mano_p90', 'of_saques_mano_pct']),
    ]),
    DISPONIBILIDAD,
]


def jerarquia_de(grupo: str) -> Jerarquia:
    return JERARQUIA_PORTEROS if grupo == 'Porteros' else JERARQUIA


# Peso de cada categoría en la parte "categorías" de la nota global, según lo que se le pide a cada grupo de
# demarcación. Disponibilidad y Balón Parado (solo puntúa a lanzadoras) NO penalizan en la nota global.
PESOS_GRUPO: Dict[str, Dict[str, float]] = {
    'Delanteros':  {'ataque': 0.55, 'construccion': 0.25, 'defensa': 0.20, 'balon_parado': 0.00},
    'Extremos':    {'ataque': 0.45, 'construccion': 0.40, 'defensa': 0.15, 'balon_parado': 0.00},
    'Mediapuntas': {'ataque': 0.45, 'construccion': 0.45, 'defensa': 0.10, 'balon_parado': 0.00},
    'Medios':      {'ataque': 0.20, 'construccion': 0.50, 'defensa': 0.30, 'balon_parado': 0.00},
    'Laterales':   {'ataque': 0.25, 'construccion': 0.35, 'defensa': 0.40, 'balon_parado': 0.00},
    'Centrales':   {'ataque': 0.10, 'construccion': 0.30, 'defensa': 0.60, 'balon_parado': 0.00},
    'Porteros':    {'ataque': 0.00, 'construccion': 0.20, 'defensa': 0.80, 'balon_parado': 0.00},
}

# Métricas en las que menos es mejor (def_xg_contra_p90 se excluye: mide volumen defensivo del equipo, no error de GK)
MALUS = {'comp_disciplina_malus', 'def_goles_encajados_p90', 'def_errores_p90', 'def_centros_no_blocados_p90',
         'of_perdidas_p90', 'def_goles_menos_xgc_p90'}
# Diferencias (pueden ser negativas): un 0 sí informa, no se descarta como "sin acciones" (scoring._z_metricas)
DIFERENCIAS = {'of_goles_menos_xg_p90', 'def_goles_menos_xgc_p90'}
# Métricas de volumen o contexto que NO se corrigen por minutos (ya miden cuánto juega o son de temporada)
SIN_CORRECCION = {'disp_partidos', 'comp_minutos', 'disp_minutos_equipo_pct', 'comp_titular_pct',
                  'comp_capitan', 'comp_regularidad', 'comp_polivalencia_demarcacion', 'of_saque_banda_largo_max'}

CATEGORIAS = [c for c, _, _ in JERARQUIA]
METRICA_SUB = {m: (c, s) for jer in (JERARQUIA, JERARQUIA_PORTEROS) for c, _, subs in jer for s, _, ms in subs for m in ms}


# Métricas clave por posición (departamento de scouting, noviembre 2026): las 8 de cada demarcación en orden de
# prioridad (pesos decrecientes) + extras: xG, goles y goles − xG a AMF, W y CF; xCA a DMF, CMF y AMF; goles − xG en
# contra a las porteras. Son la parte principal de la nota global (PESO_CLAVE en config.py) y de la nota por partido.
# Opta "FwdZonePass" = pases en campo rival (of_pases_rival_buenos_p90), no "hacia adelante".
_ORDEN = (.17, .15, .14, .13, .12, .11, .09, .09)
_EXTRA = .14


def _plantilla(metricas: List[str], extras: Tuple[str, ...] = ()) -> Dict[str, float]:
    pesos = dict(zip(metricas, _ORDEN))
    for m in extras:
        pesos[m] = max(pesos.get(m, 0), _EXTRA)
    return pesos


PLANTILLAS_POSICION: Dict[str, Dict[str, float]] = {
    'GK': {
        'def_goles_menos_xgc_p90': 0.22,
        'def_paradas_pct': 0.16,
        'def_paradas_p90': 0.14,
        'def_paradas_ocasiones_claras_p90': 0.10,
        'def_paradas_area_p90': 0.08,
        'def_salidas_libero_p90': 0.08,
        'def_goles_encajados_p90': 0.05,
        'of_pases_buenos_p90': 0.07,
        'of_envios_largos_p90': 0.05,
        'of_saques_puerta_pct': 0.05,
    },
    'CB': _plantilla(['def_duelos_ganados_p90', 'def_aereos_ganados_p90', 'def_intercepciones_p90', 'def_despejes_p90',
                      'of_pases_buenos_p90', 'of_pases_rival_buenos_p90', 'of_pases_largos_p90', 'of_toques_p90']),
    'FB': _plantilla(['of_xA_p90', 'of_centros_buenos_p90', 'of_toques_area_rival_p90', 'of_entradas_ultimo_tercio_p90',
                      'of_pases_rival_buenos_p90', 'def_duelos_ganados_p90', 'def_recuperaciones_p90',
                      'def_intercepciones_p90']),
    'DMF': _plantilla(['def_duelos_ganados_p90', 'def_aereos_ganados_p90', 'def_intercepciones_p90',
                       'def_recuperaciones_p90', 'of_toques_p90', 'of_pases_buenos_p90', 'of_pases_rival_buenos_p90',
                       'of_toques_area_rival_p90'],
                      ('of_xCA_p90',)),
    'CMF': {
        'of_xCA_p90': 0.14,
        'of_pases_buenos_p90': 0.13,
        'of_progresivos_p90': 0.12,
        'def_recuperaciones_p90': 0.12,
        'of_xA_p90': 0.11,
        'of_toques_p90': 0.10,
        'of_grandes_ocasiones_creadas_p90': 0.10,
        'of_toques_area_rival_p90': 0.09,
        'of_xG_p90': 0.05,
        'of_goles_p90': 0.04,
    },
    'AMF': _plantilla(['of_toques_area_rival_p90', 'of_toques_p90', 'of_goles_p90', 'of_asistencia_gol_p90', 'of_xG_p90',
                       'of_grandes_ocasiones_creadas_p90', 'of_regates_p90', 'of_xA_p90'],
                      ('of_xCA_p90', 'of_goles_p90', 'of_xG_p90', 'of_goles_menos_xg_p90')),
    'W': {
        'of_goles_p90': 0.16,
        'of_xG_p90': 0.14,
        'of_asistencia_gol_p90': 0.14,
        'of_regates_p90': 0.13,
        'of_xA_p90': 0.12,
        'of_grandes_ocasiones_creadas_p90': 0.10,
        'of_centros_buenos_p90': 0.08,
        'of_entradas_area_p90': 0.07,
        'of_goles_menos_xg_p90': 0.06,
    },
    'CF': _plantilla(['of_goles_p90', 'of_xG_p90', 'of_asistencia_gol_p90', 'of_xA_p90', 'of_tiros_puerta_area_p90',
                      'of_toques_area_rival_p90', 'of_toques_p90', 'def_aereos_ganados_p90'],
                     ('of_goles_menos_xg_p90',)),
}
_PLANTILLA_GRUPO = {'Porteros': 'GK', 'Centrales': 'CB', 'Laterales': 'FB', 'Medios': 'CMF',
                    'Mediapuntas': 'AMF', 'Extremos': 'W', 'Delanteros': 'CF'}


def plantilla_de(demarcacion: str, grupo: str) -> str:
    """Plantilla de métricas clave según la demarcación principal (la de más minutos)."""
    if 'defensivo' in str(demarcacion or '').lower():
        return 'DMF'
    return _PLANTILLA_GRUPO.get(grupo, 'CMF')
