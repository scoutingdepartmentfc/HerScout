"""
pipeline/categorias.py
Jerarquía Categoría → Subcategoría → Métricas y pesos de la nota global por grupo de demarcación.
Es la fuente única: src/features/scouting/metricasJerarquia.ts la replica (mismos ids y claves).

Las claves son las de metrics_engine.py; las `disp_*` se calculan en scoring.py con los datos de temporada.
Las métricas solo de eventing no existen en temporadas de solo matchstats: la subcategoría se calcula con
las que haya y, si no queda ninguna, queda "sin datos" (no puntúa ni a favor ni en contra).
"""

from typing import Dict, List, Tuple

JERARQUIA: List[Tuple[str, str, List[Tuple[str, str, List[str]]]]] = [
    ('ataque', 'Ataque', [
        ('finalizacion', 'Finalización', [
            'of_goles_p90', 'of_goles_dentro_area_p90', 'of_goles_fuera_area_p90', 'of_xG_p90', 'of_tiros_p90',
            'of_tiros_dentro_pct', 'of_disparos_fuera_area_p90', 'of_grandes_ocasiones_p90', 'of_1vs1_portero_p90',
            'of_remates_primeras_p90', 'of_remates_primeras_1er_palo_p90', 'of_remates_primeras_2o_palo_p90',
            'of_remates_centro_p90', 'of_goles_remate_centro_p90']),
        ('creacion', 'Creación', [
            'of_asistencias_p90', 'of_asistencia_gol_p90', 'of_xA_p90', 'of_xCA_p90', 'of_pases_con_ventaja_p90',
            'of_pase_filtrado_avanzado_p90', 'of_pase_largo_finalizacion_p90', 'of_pases_dentro_area_p90',
            'of_centros_buenos_p90', 'of_centros_buenos_pct', 'of_llegadas_area_pase_remate_p90']),
    ]),
    ('construccion', 'Construcción', [
        ('pase', 'Pase', [
            'of_pases_buenos_p90', 'of_pases_pct', 'of_pases_propios_buenos_p90', 'of_pases_propios_pct',
            'of_pases_rival_buenos_p90', 'of_pases_rival_pct', 'of_pases_largos_p90', 'of_pases_largos_pct',
            'of_pases_horizontales_propios_p90', 'of_pases_horizontales_propios_pct',
            'of_pases_horizontales_rival_p90', 'of_pases_horizontales_rival_pct', 'of_participacion_pct',
            'of_participacion_pos_pct', 'of_ambidiestro_pct', 'of_descarga_primeras_p90']),
        ('progresion', 'Progresión', [
            'of_progresivos_p90', 'of_progresivos_pct', 'of_prog_cen_p90', 'of_prog_cen_pct', 'of_cambios_ori_p90',
            'of_cambios_ori_pct', 'of_conduccion_pase_p90', 'of_pases_recibidos_carril_central_p90',
            'of_aparecer_campo_rival_p90', 'of_doblar_campo_rival_p90']),
        ('regate', 'Regate', [
            'of_regates_p90', 'of_regates_pct', 'of_regates_z4_p90', 'of_regates_hacia_porteria_p90',
            'of_jugadas_indiv_gol_p90', 'of_jugadas_indiv_tiro_p90']),
    ]),
    ('defensa', 'Defensa', [
        ('porteria', 'Portería', [
            'def_paradas_p90', 'def_goles_encajados_p90', 'def_paradas_pct', 'def_paradas_area_p90',
            'def_paradas_fuera_area_p90', 'def_paradas_ocasiones_claras_p90', 'def_despejes_punos_p90',
            'def_salidas_libero_p90', 'def_porteria_cero_pct']),
        ('recuperacion', 'Recuperación', [
            'def_recuperaciones_p90', 'def_recup_propio_p90', 'def_recup_rival_p90', 'def_recup_z4_p90',
            'def_recup_area_prop_p90', 'def_intercepciones_p90', 'def_intercep_propio_p90', 'def_intercep_rival_p90',
            'def_intercep_z4_p90', 'def_intercep_area_prop_p90', 'def_centros_bloqueados_p90']),
        ('duelos', 'Duelos', [
            'def_entradas_p90', 'def_entradas_pct', 'def_entradas_propio_p90', 'def_entradas_propio_pct',
            'def_entradas_rival_p90', 'def_entradas_rival_pct', 'def_entradas_z4_p90', 'def_entradas_z4_pct',
            'def_entradas_area_prop_p90', 'def_entradas_area_prop_pct', 'def_1v1_ganados_propio_p90',
            'def_1v1_ganados_rival_p90', 'def_1v1_ganados_area_prop_p90']),
        ('aereo', 'Juego aéreo', [
            'def_aereos_ganados_p90', 'def_aereos_ganados_pct', 'def_aereos_continuidad_p90',
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
    ('disponibilidad', 'Disponibilidad', [
        ('participacion', 'Participación', [
            'disp_partidos', 'comp_minutos', 'disp_minutos_equipo_pct', 'comp_titular_pct']),
        ('fiabilidad', 'Fiabilidad', [
            'comp_regularidad', 'comp_regularidad_min90', 'comp_capitan', 'comp_disciplina_malus',
            'comp_polivalencia_demarcacion', 'of_polivalencia', 'of_regular_polivalencia']),
    ]),
]

# Peso de cada categoría en la nota global. Disponibilidad pesa siempre lo mismo (premia jugar mucho);
# el resto se reparte según lo que se le pide a cada grupo de demarcación.
PESO_DISPONIBILIDAD = 0.20
PESOS_GRUPO: Dict[str, Dict[str, float]] = {
    'Delanteros':  {'ataque': 0.50, 'construccion': 0.20, 'defensa': 0.15, 'balon_parado': 0.15},
    'Extremos':    {'ataque': 0.40, 'construccion': 0.35, 'defensa': 0.15, 'balon_parado': 0.10},
    'Mediapuntas': {'ataque': 0.40, 'construccion': 0.40, 'defensa': 0.10, 'balon_parado': 0.10},
    'Medios':      {'ataque': 0.15, 'construccion': 0.45, 'defensa': 0.30, 'balon_parado': 0.10},
    'Laterales':   {'ataque': 0.20, 'construccion': 0.30, 'defensa': 0.40, 'balon_parado': 0.10},
    'Centrales':   {'ataque': 0.05, 'construccion': 0.30, 'defensa': 0.55, 'balon_parado': 0.10},
    'Porteros':    {'ataque': 0.00, 'construccion': 0.50, 'defensa': 0.40, 'balon_parado': 0.10},
}

# Métricas en las que menos es mejor
MALUS = {'comp_disciplina_malus', 'def_goles_encajados_p90'}
# Métricas de volumen o contexto que NO se corrigen por minutos (ya miden cuánto juega o son de temporada)
SIN_CORRECCION = {'disp_partidos', 'comp_minutos', 'disp_minutos_equipo_pct', 'comp_titular_pct',
                  'comp_capitan', 'comp_regularidad', 'comp_polivalencia_demarcacion', 'of_saque_banda_largo_max'}

CATEGORIAS = [c for c, _, _ in JERARQUIA]
METRICA_SUB = {m: (c, s) for c, _, subs in JERARQUIA for s, _, ms in subs for m in ms}
