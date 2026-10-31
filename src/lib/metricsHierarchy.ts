// Categories, sub-categories and metrics. Same ids and keys as pipeline/categorias.py (single source of truth).
// Notes 0-100 are computed by the pipeline relative to the league average of the position group
// (average player ≈ 62; percentile corrected by minutes, then standardised)
// and arrive in radar_data.metricas as `_cat_<id>` and `_sub_<id>`: [note0_100, note0_10].
// Every metric arrives as `<key>`: [value (per 90 or %), note0_10].

export interface MetricDef {
  key: string;
  name: string;
  isPct?: boolean;
}

export interface SubcategoryDef {
  id: string;
  name: string;
  metrics: MetricDef[];
}

export interface CategoryDef {
  id: string;
  name: string;
  color: string;
  noteKey: string; // 0-100 column in player_season_stats
  subcategories: SubcategoryDef[];
}

export type Metricas = Record<string, [number, number]>;

const m = (key: string, name: string, isPct = false): MetricDef => ({ key, name, isPct });

const AVAILABILITY: CategoryDef = {
    id: "disponibilidad",
    name: "Availability",
    color: "#06b6d4",
    noteKey: "nota_disponibilidad",
    subcategories: [
      {
        id: "participacion",
        name: "Participation",
        metrics: [
          m("disp_partidos", "Matches played"),
          m("comp_minutos", "Minutes played"),
          m("disp_minutos_equipo_pct", "% of team minutes played", true),
          m("comp_titular_pct", "Starts %", true),
        ],
      },
      {
        id: "fiabilidad",
        name: "Reliability",
        metrics: [
          m("comp_regularidad", "Overall consistency"),
          m("comp_regularidad_min90", "Consistency per 90"),
          m("comp_capitan", "Captaincy"),
          m("comp_disciplina_malus", "Discipline (cards/fouls malus)"),
          m("comp_polivalencia_demarcacion", "Positional versatility"),
          m("of_polivalencia", "Versatility"),
          m("of_regular_polivalencia", "Consistency across positions"),
        ],
      },
    ],
  };

// Outfield players
export const METRICS_HIERARCHY: CategoryDef[] = [
  {
    id: "ataque",
    name: "Attack",
    color: "#10b981",
    noteKey: "nota_ataque",
    subcategories: [
      {
        id: "finalizacion",
        name: "Finishing",
        metrics: [
          m("of_goles_p90", "Goals"),
          m("of_goles_dentro_area_p90", "Goals inside the box"),
          m("of_goles_fuera_area_p90", "Goals outside the box"),
          m("of_xG_p90", "xG (expected goals)"),
          m("of_tiros_p90", "Total shots"),
          m("of_tiros_dentro_pct", "Shots on target %", true),
          m("of_disparos_fuera_area_p90", "Shots outside the box"),
          m("of_grandes_ocasiones_p90", "Big chances"),
          m("of_1vs1_portero_p90", "1v1 against the goalkeeper"),
          m("of_remates_primeras_p90", "First-time shots"),
          m("of_remates_primeras_1er_palo_p90", "First-time shots (near post)"),
          m("of_remates_primeras_2o_palo_p90", "First-time shots (far post)"),
          m("of_remates_centro_p90", "Shots from crosses"),
          m("of_goles_remate_centro_p90", "Goals from crosses"),
        ],
      },
      {
        id: "creacion",
        name: "Chance Creation",
        metrics: [
          m("of_asistencias_p90", "Key passes"),
          m("of_asistencia_gol_p90", "Goal assists"),
          m("of_xA_p90", "xA (expected assists)"),
          m("of_xCA_p90", "xCA (expected chain actions)"),
          m("of_pases_con_ventaja_p90", "Advantage passes"),
          m("of_pase_filtrado_avanzado_p90", "Advanced through balls"),
          m("of_pase_largo_finalizacion_p90", "Long passes to a shot"),
          m("of_pases_dentro_area_p90", "Passes into the box"),
          m("of_centros_buenos_p90", "Completed crosses"),
          m("of_centros_buenos_pct", "Cross accuracy %", true),
          m("of_llegadas_area_pase_remate_p90", "Box arrivals: pass to shot"),
        ],
      },
    ],
  },
  {
    id: "construccion",
    name: "Build-Up",
    color: "#3b82f6",
    noteKey: "nota_construccion",
    subcategories: [
      {
        id: "pase",
        name: "Passing",
        metrics: [
          m("of_pases_buenos_p90", "Accurate passes"),
          m("of_pases_pct", "Pass accuracy %", true),
          m("of_pases_propios_buenos_p90", "Accurate passes own half"),
          m("of_pases_propios_pct", "Pass accuracy own half %", true),
          m("of_pases_rival_buenos_p90", "Accurate passes opp. half"),
          m("of_pases_rival_pct", "Pass accuracy opp. half %", true),
          m("of_pases_largos_p90", "Long passes"),
          m("of_pases_largos_pct", "Long pass accuracy %", true),
          m("of_pases_horizontales_propios_p90", "Horizontal passes own half"),
          m("of_pases_horizontales_propios_pct", "Horizontal passes own half %", true),
          m("of_pases_horizontales_rival_p90", "Horizontal passes opp. half"),
          m("of_pases_horizontales_rival_pct", "Horizontal passes opp. half %", true),
          m("of_participacion_pct", "Involvement in play %", true),
          m("of_participacion_pos_pct", "Involvement in possession %", true),
          m("of_ambidiestro_pct", "Weak foot usage %", true),
          m("of_descarga_primeras_p90", "First-time lay-offs"),
        ],
      },
      {
        id: "progresion",
        name: "Progression",
        metrics: [
          m("of_progresivos_p90", "Progressive passes"),
          m("of_progresivos_pct", "Progressive pass accuracy %", true),
          m("of_prog_cen_p90", "Progression to the centre"),
          m("of_prog_cen_pct", "Progression to the centre %", true),
          m("of_cambios_ori_p90", "Switches of play"),
          m("of_cambios_ori_pct", "Switches of play %", true),
          m("of_conduccion_pase_p90", "Carry and pass"),
          m("of_pases_recibidos_carril_central_p90", "Passes received in central lane"),
          m("of_aparecer_campo_rival_p90", "Appearances in opp. half"),
          m("of_doblar_campo_rival_p90", "Overlaps in opp. half"),
        ],
      },
      {
        id: "regate",
        name: "Dribbling",
        metrics: [
          m("of_regates_p90", "Dribbles attempted"),
          m("of_regates_pct", "Dribble success %", true),
          m("of_regates_z4_p90", "Dribbles in final third"),
          m("of_regates_hacia_porteria_p90", "Dribbles towards goal"),
          m("of_jugadas_indiv_gol_p90", "Solo runs ending in goal"),
          m("of_jugadas_indiv_tiro_p90", "Solo runs ending in shot"),
        ],
      },
    ],
  },
  {
    id: "defensa",
    name: "Defense",
    color: "#f59e0b",
    noteKey: "nota_defensa",
    subcategories: [
      {
        id: "recuperacion",
        name: "Recoveries",
        metrics: [
          m("def_recuperaciones_p90", "Total recoveries"),
          m("def_recup_propio_p90", "Recoveries own half"),
          m("def_recup_rival_p90", "Recoveries opp. half"),
          m("def_recup_z4_p90", "Recoveries in final third"),
          m("def_recup_area_prop_p90", "Recoveries in own box"),
          m("def_intercepciones_p90", "Total interceptions"),
          m("def_intercep_propio_p90", "Interceptions own half"),
          m("def_intercep_rival_p90", "Interceptions opp. half"),
          m("def_intercep_z4_p90", "Interceptions in final third"),
          m("def_intercep_area_prop_p90", "Interceptions in own box"),
          m("def_centros_bloqueados_p90", "Blocked crosses"),
        ],
      },
      {
        id: "duelos",
        name: "Duels",
        metrics: [
          m("def_entradas_p90", "Tackles"),
          m("def_entradas_pct", "Tackle success %", true),
          m("def_entradas_propio_p90", "Tackles own half"),
          m("def_entradas_propio_pct", "Tackles own half %", true),
          m("def_entradas_rival_p90", "Tackles opp. half"),
          m("def_entradas_rival_pct", "Tackles opp. half %", true),
          m("def_entradas_z4_p90", "Tackles in final third"),
          m("def_entradas_z4_pct", "Tackles in final third %", true),
          m("def_entradas_area_prop_p90", "Tackles in own box"),
          m("def_entradas_area_prop_pct", "Tackles in own box %", true),
          m("def_1v1_ganados_propio_p90", "Defensive 1v1 own half"),
          m("def_1v1_ganados_rival_p90", "Defensive 1v1 opp. half"),
          m("def_1v1_ganados_area_prop_p90", "Defensive 1v1 in own box"),
        ],
      },
      {
        id: "aereo",
        name: "Aerial Game",
        metrics: [
          m("def_aereos_ganados_p90", "Aerial duels won"),
          m("def_aereos_ganados_pct", "Aerial duels won %", true),
          m("def_aereos_continuidad_p90", "Aerials with continuity"),
          m("def_aereos_ganados_propio_p90", "Aerials won own half"),
          m("def_aereos_ganados_propio_pct", "Aerials won own half %", true),
          m("def_aereos_ganados_propio_cont_p90", "Aerials won own half with continuity"),
          m("def_aereos_ganados_rival_p90", "Aerials won opp. half"),
          m("def_aereos_ganados_rival_pct", "Aerials won opp. half %", true),
          m("def_aereos_ganados_rival_cont_p90", "Aerials won opp. half with continuity"),
          m("def_aereos_ganados_area_prop_p90", "Aerials won in own box"),
          m("def_aereos_ganados_area_prop_pct", "Aerials won in own box %", true),
          m("def_aereos_ganados_area_riv_p90", "Aerials won in opp. box"),
          m("def_aereos_ganados_area_riv_pct", "Aerials won in opp. box %", true),
          m("def_despejes_propio_p90", "Clearances own half"),
          m("def_despejes_area_prop_p90", "Clearances in own box"),
        ],
      },
    ],
  },
  {
    id: "balon_parado",
    name: "Set Pieces",
    color: "#a855f7",
    noteKey: "nota_balon_parado",
    subcategories: [
      {
        id: "lanzamiento",
        name: "Delivery",
        metrics: [
          m("abp_lanzador_corner_p90", "Corner taker"),
          m("abp_lanzador_corner_pct", "Corner delivery accuracy %", true),
          m("abp_faltas_lejanas_p90", "Long free-kick taker"),
          m("abp_faltas_lejanas_pct", "Long free-kick accuracy %", true),
          m("abp_lanzador_faltas_dir_p90", "Direct free-kick taker"),
          m("abp_goles_falta_dir_p90", "Direct free-kick goals"),
          m("abp_lanzador_penaltis_p90", "Penalty taker"),
          m("of_saque_banda_efectivo_p90", "Effective throw-ins"),
          m("of_saque_banda_efectivo_pct", "Effective throw-ins %", true),
          m("of_saque_banda_z4_p90", "Throw-ins in final third"),
          m("of_saque_banda_z4_pct", "Throw-ins in final third %", true),
          m("of_saque_banda_largo_max", "Longest throw-in"),
        ],
      },
      {
        id: "remate",
        name: "Attacking Set Pieces",
        metrics: [
          m("abp_remates_corner_p90", "Shots from corners"),
          m("abp_remates_faltas_p90", "Shots from free kicks"),
        ],
      },
    ],
  },
  AVAILABILITY,
];

// Goalkeepers: their own metrics (pipeline JERARQUIA_PORTEROS). Same category ids / nota_* columns:
// defensa = Goalkeeping, construccion = Distribution. No attack or set pieces.
export const GOALKEEPER_HIERARCHY: CategoryDef[] = [
  {
    id: "defensa",
    name: "Goalkeeping",
    color: "#f59e0b",
    noteKey: "nota_defensa",
    subcategories: [
      {
        id: "paradas",
        name: "Shot Stopping",
        metrics: [
          m("def_paradas_p90", "Total saves"),
          m("def_paradas_pct", "Save percentage %", true),
          m("def_paradas_area_p90", "Saves inside the box"),
          m("def_paradas_fuera_area_p90", "Saves outside the box"),
          m("def_paradas_ocasiones_claras_p90", "Saves from big chances"),
          m("def_goles_encajados_p90", "Goals conceded"),
          m("def_porteria_cero_pct", "Clean sheets %", true),
          m("def_penaltis_parados_pct", "Penalties saved %", true),
          m("def_errores_p90", "Errors leading to shot/goal"),
        ],
      },
      {
        id: "dominio_area",
        name: "Box Control",
        metrics: [
          m("def_blocajes_p90", "High claims"),
          m("def_blocajes_pct", "High claim success %", true),
          m("def_centros_no_blocados_p90", "Crosses not claimed"),
          m("def_despejes_punos_p90", "Punches"),
          m("def_salidas_libero_p90", "Sweeper keeper actions"),
          m("def_salidas_libero_pct", "Sweeper keeper success %", true),
        ],
      },
    ],
  },
  {
    id: "construccion",
    name: "Distribution",
    color: "#3b82f6",
    noteKey: "nota_construccion",
    subcategories: [
      {
        id: "juego_pie",
        name: "Distribution with Feet",
        metrics: [
          m("of_pases_buenos_p90", "Accurate passes"),
          m("of_pases_pct", "Pass accuracy %", true),
          m("of_pases_largos_p90", "Long passes"),
          m("of_pases_largos_pct", "Long pass accuracy %", true),
          m("of_saques_puerta_pct", "Goal kick accuracy %", true),
          m("of_envios_largos_p90", "Accurate launches"),
          m("of_envios_largos_pct", "Launch accuracy %", true),
          m("of_progresivos_p90", "Progressive passes"),
          m("of_participacion_pct", "Involvement in play %", true),
        ],
      },
      {
        id: "juego_mano",
        name: "Distribution with Hands",
        metrics: [
          m("of_saques_mano_p90", "Accurate throws"),
          m("of_saques_mano_pct", "Throw accuracy %", true),
        ],
      },
    ],
  },
  AVAILABILITY,
];

export function isGoalkeeper(grupo?: string | null, position?: string | null): boolean {
  if (grupo) return grupo === "Porteros";
  const p = (position || "").toLowerCase();
  return p.includes("porter") || p.includes("goalkeeper") || p === "gk";
}

/** Hierarchy that applies to a player, by pipeline position group (grupo_demarcacion) */
export function hierarchyFor(grupo?: string | null, position?: string | null): CategoryDef[] {
  return isGoalkeeper(grupo, position) ? GOALKEEPER_HIERARCHY : METRICS_HIERARCHY;
}

/** Sub-category note 0-100 (null = no data: its metrics do not exist in this season, e.g. no eventing) */
export function subcategoryNote(sub: SubcategoryDef, metricas: Metricas): number | null {
  const computed = metricas[`_sub_${sub.id}`];
  return computed ? Math.round(computed[0]) : null;
}

/** Category note 0-100 (null = no data) */
export function categoryNote(cat: CategoryDef, metricas: Metricas): number | null {
  const computed = metricas[`_cat_${cat.id}`];
  return computed ? Math.round(computed[0]) : null;
}
