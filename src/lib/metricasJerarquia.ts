// Mapeo canónico de nombres en BD a etiquetas cortas y legibles
export const ETIQUETAS: Record<string, string> = {
  comp_minutos: 'Minutos jugados',
  comp_titular_pct: '% Titular',
  comp_capitan: 'Veces capitán',
  comp_importancia: 'Importancia en plantilla',
  comp_regularidad: 'Regularidad (minutos)',
  comp_polivalencia_demarcacion: 'Demarcaciones jugadas',
  comp_disciplina_malus: 'Disciplina (tarjetas/faltas)',
  of_goles_p90: 'Goles /90',
  of_asistencia_gol_p90: 'Asistencias de gol /90',
  of_asistencias_p90: 'Pases a tiro /90',
  of_xG_p90: 'xG generado /90',
  of_xA_p90: 'xA generado /90',
  of_goles_menos_xg_p90: 'Goles − xG /90',
  of_tiros_puerta_area_p90: 'Tiros a puerta en el área /90',
  of_entradas_ultimo_tercio_p90: 'Entradas al último tercio /90',
  def_goles_menos_xgc_p90: 'Goles encajados − xG en contra /90',
  def_xg_contra_p90: 'xG en contra /90',
  of_tiros_p90: 'Tiros /90',
  of_tiros_dentro_pct: '% Tiros a puerta',
  of_conversion_pct: '% Goles / Tiros',
  of_1vs1_portero_p90: '1 vs 1 con portera /90',
  of_grandes_ocasiones_p90: 'Grandes ocasiones /90',
  of_disparos_fuera_area_p90: 'Tiros fuera del área /90',
  of_goles_fuera_area_p90: 'Goles fuera del área /90',
  of_goles_dentro_area_p90: 'Goles dentro del área /90',
  of_remate_primer_toque_pct: '% Remates al primer toque',
  of_remate_centro_p90: 'Remates tras centro /90',
  of_jugada_individual_gol_p90: 'Jugadas individuales de gol /90',
  of_pases_buenos_p90: 'Pases acertados /90',
  of_pases_pct: '% Precisión de pase',
  of_pases_propios_buenos_p90: 'Pases en campo propio /90',
  of_pases_propios_pct: '% Precisión campo propio',
  of_pases_rival_buenos_p90: 'Pases en campo rival /90',
  of_pases_rival_pct: '% Precisión campo rival',
  of_pases_largos_p90: 'Pases largos /90',
  of_pases_largos_pct: '% Precisión pase largo',
  of_progresivos_p90: 'Pases progresivos /90',
  of_progresivos_centro_p90: 'Progresivos al carril central /90',
  of_pases_area_p90: 'Pases al área /90',
  of_pases_ventaja_p90: 'Pases con ventaja /90',
  of_cambios_orientacion_p90: 'Cambios de orientación /90',
  of_pases_horizontales_p90: 'Pases horizontales /90',
  of_pases_recibidos_centro_p90: 'Pases recibidos en el centro /90',
  of_pase_primer_toque_p90: 'Pases al primer toque /90',
  of_regates_p90: 'Regates completados /90',
  of_regates_pct: '% Éxito de regate',
  of_conduccion_pase_p90: 'Conducción y pase /90',
  of_llegadas_area_p90: 'Llegadas al área /90',
  of_centros_buenos_p90: 'Centros completados /90',
  of_centros_pct: '% Precisión en centros',
  of_participacion_pct: 'Cuota de pases del equipo',
  of_ambidiestro_pct: '% Uso pie débil',
  def_entradas_p90: 'Entradas ganadas /90',
  def_entradas_pct: '% Entradas ganadas',
  def_intercepciones_p90: 'Intercepciones /90',
  def_recuperaciones_p90: 'Recuperaciones /90',
  def_recuperaciones_rival_p90: 'Recuperaciones en campo rival /90',
  def_aereos_ganados_p90: 'Duelos aéreos ganados /90',
  def_aereos_pct: '% Duelos aéreos ganados',
  def_duelos_suelo_p90: 'Duelos en suelo /90',
  def_duelos_suelo_pct: '% Duelos en suelo ganados',
  def_despejes_p90: 'Despejes /90',
  def_bloqueos_p90: 'Tiros bloqueados /90',
  def_paradas_p90: 'Paradas /90',
  def_paradas_pct: '% Paradas',
  def_porteria_cero_pct: '% Portería a cero',
  abp_lanzador_corner_p90: 'Córners lanzados /90',
  abp_faltas_directas_p90: 'Faltas directas /90',
};

export interface JerarquiaSubcategoria {
  subcategoria: string;
  metricas: string[];
}

export interface JerarquiaCategoria {
  categoria: string;
  notaKey: string;
  subcategorias: JerarquiaSubcategoria[];
}

export const JERARQUIA: JerarquiaCategoria[] = [
  {
    categoria: 'Ataque',
    notaKey: 'nota_ataque',
    subcategorias: [
      {
        subcategoria: 'Finalización',
        metricas: [
          'of_goles_p90',
          'of_xG_p90',
          'of_tiros_p90',
          'of_tiros_dentro_pct',
          'of_conversion_pct',
          'of_1vs1_portero_p90',
          'of_grandes_ocasiones_p90',
          'of_goles_dentro_area_p90',
          'of_goles_fuera_area_p90',
          'of_disparos_fuera_area_p90',
        ],
      },
      {
        subcategoria: 'Creación de peligro',
        metricas: [
          'of_asistencia_gol_p90',
          'of_asistencias_p90',
          'of_xA_p90',
          'of_pases_area_p90',
          'of_pases_ventaja_p90',
        ],
      },
      {
        subcategoria: '1 vs 1 y desequilibrio',
        metricas: [
          'of_regates_p90',
          'of_regates_pct',
          'of_conduccion_pase_p90',
          'of_llegadas_area_p90',
          'of_centros_buenos_p90',
          'of_centros_pct',
        ],
      },
    ],
  },
  {
    categoria: 'Construcción',
    notaKey: 'nota_construccion',
    subcategorias: [
      {
        subcategoria: 'Precisión y volumen',
        metricas: [
          'of_pases_buenos_p90',
          'of_pases_pct',
          'of_pases_propios_buenos_p90',
          'of_pases_propios_pct',
          'of_pases_rival_buenos_p90',
          'of_pases_rival_pct',
          'of_participacion_pct',
        ],
      },
      {
        subcategoria: 'Progresión y verticalidad',
        metricas: [
          'of_progresivos_p90',
          'of_progresivos_centro_p90',
          'of_pases_largos_p90',
          'of_pases_largos_pct',
          'of_cambios_orientacion_p90',
          'of_pases_recibidos_centro_p90',
        ],
      },
    ],
  },
  {
    categoria: 'Defensa',
    notaKey: 'nota_defensa',
    subcategorias: [
      {
        subcategoria: 'Duelos y robo',
        metricas: [
          'def_entradas_p90',
          'def_entradas_pct',
          'def_intercepciones_p90',
          'def_recuperaciones_p90',
          'def_recuperaciones_rival_p90',
        ],
      },
      {
        subcategoria: 'Juego aéreo y protección',
        metricas: [
          'def_aereos_ganados_p90',
          'def_aereos_pct',
          'def_despejes_p90',
          'def_bloqueos_p90',
        ],
      },
    ],
  },
  {
    categoria: 'Balón Parado',
    notaKey: 'nota_balon_parado',
    subcategorias: [
      {
        subcategoria: 'Ejecución ABP',
        metricas: ['abp_lanzador_corner_p90', 'abp_faltas_directas_p90'],
      },
    ],
  },
  {
    categoria: 'Disponibilidad',
    notaKey: 'nota_disponibilidad',
    subcategorias: [
      {
        subcategoria: 'Continuidad y regularidad',
        metricas: [
          'comp_minutos',
          'comp_titular_pct',
          'comp_capitan',
          'comp_importancia',
          'comp_regularidad',
          'comp_polivalencia_demarcacion',
          'comp_disciplina_malus',
        ],
      },
    ],
  },
];

