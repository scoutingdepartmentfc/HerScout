/**
 * Positional Stats & Positional Radar metric configurations (SPEC §6.6).
 * Every key maps to `player_season_stats.radar_data.metricas[key] = [value, note0_10]`.
 */

export type PositionalGroupId = "GK" | "CB" | "FB" | "DMF" | "CMF" | "AMF" | "W" | "CF";

export interface PositionalMetricDef {
  key: string;
  label: string;        // Label in Block 3 (Positional Stats)
  shortLabel: string;   // Short axis label in Block 5 (Positional Radar)
  isPct?: boolean;      // True for percentage metrics (do not multiply in Totals mode)
  invert?: boolean;     // True when lower value is better
}

export interface PositionalConfig {
  id: PositionalGroupId;
  shortCode: string;    // e.g. "CDM", "CB", "ST"
  name: string;
  grupo: string;        // Pipeline `grupo_demarcacion` comparison pool
  metrics: PositionalMetricDef[];
}

const m = (
  key: string,
  label: string,
  shortLabel: string,
  opts: { isPct?: boolean; invert?: boolean } = {}
): PositionalMetricDef => ({
  key,
  label,
  shortLabel,
  isPct: opts.isPct,
  invert: opts.invert,
});

export const POSITIONAL_CONFIGS: Record<PositionalGroupId, PositionalConfig> = {
  // SPEC §6.6 Default for CDM/DMF:
  // Progressive passes /90, Pass accuracy %, Recoveries /90, Interceptions /90,
  // Duels won %, xA /90, Shots /90 (outside box), Aerial duels %
  DMF: {
    id: "DMF",
    shortCode: "CDM",
    name: "Defensive Midfielder",
    grupo: "Medios",
    metrics: [
      m("of_progresivos_p90", "Progressive passes /90", "Prog. passes"),
      m("of_pases_pct", "Pass accuracy %", "Pass %", { isPct: true }),
      m("def_recuperaciones_p90", "Recoveries /90", "Recoveries"),
      m("def_intercepciones_p90", "Interceptions /90", "Interceptions"),
      m("def_duelos_ganados_pct", "Duels won %", "Duels %", { isPct: true }),
      m("of_xA_p90", "xA /90", "xA"),
      m("of_disparos_fuera_area_p90", "Shots /90 (outside box)", "Long shots"),
      m("def_aereos_ganados_pct", "Aerial duels %", "Aerial %", { isPct: true }),
    ],
  },
  CMF: {
    id: "CMF",
    shortCode: "CM",
    name: "Central Midfielder",
    grupo: "Medios",
    metrics: [
      m("of_progresivos_p90", "Progressive passes /90", "Prog. passes"),
      m("of_pases_pct", "Pass accuracy %", "Pass %", { isPct: true }),
      m("of_xCA_p90", "xCA /90", "xCA"),
      m("of_xA_p90", "xA /90", "xA"),
      m("def_recuperaciones_p90", "Recoveries /90", "Recoveries"),
      m("def_duelos_ganados_pct", "Duels won %", "Duels %", { isPct: true }),
      m("of_toques_area_rival_p90", "Touches opp. box /90", "Box touches"),
      m("of_entradas_ultimo_tercio_p90", "Final third entries /90", "Final 3rd"),
    ],
  },
  AMF: {
    id: "AMF",
    shortCode: "CAM",
    name: "Attacking Midfielder",
    grupo: "Mediapuntas",
    metrics: [
      m("of_xA_p90", "xA /90", "xA"),
      m("of_xG_p90", "xG /90", "xG"),
      m("of_asistencias_p90", "Key passes /90", "Key passes"),
      m("of_pase_filtrado_avanzado_p90", "Through balls /90", "Through balls"),
      m("of_toques_area_rival_p90", "Touches opp. box /90", "Box touches"),
      m("of_regates_p90", "Dribbles /90", "Dribbles"),
      m("of_progresivos_p90", "Progressive passes /90", "Prog. passes"),
      m("of_pases_pct", "Pass accuracy %", "Pass %", { isPct: true }),
    ],
  },
  CB: {
    id: "CB",
    shortCode: "CB",
    name: "Centre-Back",
    grupo: "Centrales",
    metrics: [
      m("def_duelos_ganados_pct", "Duels won %", "Duels %", { isPct: true }),
      m("def_aereos_ganados_pct", "Aerial duels %", "Aerial %", { isPct: true }),
      m("def_intercepciones_p90", "Interceptions /90", "Interceptions"),
      m("def_recuperaciones_p90", "Recoveries /90", "Recoveries"),
      m("def_despejes_p90", "Clearances /90", "Clearances"),
      m("of_pases_pct", "Pass accuracy %", "Pass %", { isPct: true }),
      m("of_progresivos_p90", "Progressive passes /90", "Prog. passes"),
      m("of_pases_largos_p90", "Long balls /90", "Long balls"),
    ],
  },
  FB: {
    id: "FB",
    shortCode: "FB",
    name: "Full-Back",
    grupo: "Laterales",
    metrics: [
      m("of_xA_p90", "xA /90", "xA"),
      m("of_centros_buenos_p90", "Accurate crosses /90", "Crosses"),
      m("of_entradas_ultimo_tercio_p90", "Final third entries /90", "Final 3rd"),
      m("of_progresivos_p90", "Progressive passes /90", "Prog. passes"),
      m("def_duelos_ganados_pct", "Duels won %", "Duels %", { isPct: true }),
      m("def_recuperaciones_p90", "Recoveries /90", "Recoveries"),
      m("def_intercepciones_p90", "Interceptions /90", "Interceptions"),
      m("of_pases_pct", "Pass accuracy %", "Pass %", { isPct: true }),
    ],
  },
  W: {
    id: "W",
    shortCode: "W",
    name: "Winger",
    grupo: "Extremos",
    metrics: [
      m("of_goles_p90", "Goals /90", "Goals"),
      m("of_xG_p90", "xG /90", "xG"),
      m("of_xA_p90", "xA /90", "xA"),
      m("of_regates_p90", "Dribbles /90", "Dribbles"),
      m("of_regates_pct", "Dribble success %", "Dribble %", { isPct: true }),
      m("of_centros_buenos_p90", "Accurate crosses /90", "Crosses"),
      m("of_toques_area_rival_p90", "Touches opp. box /90", "Box touches"),
      m("of_entradas_area_p90", "Box entries /90", "Box entries"),
    ],
  },
  CF: {
    id: "CF",
    shortCode: "ST",
    name: "Centre-Forward",
    grupo: "Delanteros",
    metrics: [
      m("of_goles_p90", "Goals /90", "Goals"),
      m("of_xG_p90", "xG /90", "xG"),
      m("of_tiros_p90", "Shots /90", "Shots"),
      m("of_tiros_dentro_pct", "Shots on target %", "Shot acc %", { isPct: true }),
      m("of_xA_p90", "xA /90", "xA"),
      m("of_toques_area_rival_p90", "Touches opp. box /90", "Box touches"),
      m("def_aereos_ganados_pct", "Aerial duels %", "Aerial %", { isPct: true }),
      m("of_grandes_ocasiones_p90", "Big chances /90", "Big chances"),
    ],
  },
  GK: {
    id: "GK",
    shortCode: "GK",
    name: "Goalkeeper",
    grupo: "Porteros",
    metrics: [
      m("def_goles_menos_xgc_p90", "Goals − xG conceded /90", "Goals−xGC", { invert: true }),
      m("def_paradas_pct", "Save %", "Save %", { isPct: true }),
      m("def_paradas_p90", "Saves /90", "Saves"),
      m("def_paradas_ocasiones_claras_p90", "Big chance saves /90", "Big saves"),
      m("def_salidas_libero_p90", "Sweeper actions /90", "Sweeper"),
      m("def_goles_encajados_p90", "Goals conceded /90", "GA /90", { invert: true }),
      m("of_pases_pct", "Pass accuracy %", "Pass %", { isPct: true }),
      m("of_pases_largos_pct", "Long pass accuracy %", "Long %", { isPct: true }),
    ],
  },
};

const POS_TO_CONFIG: Record<string, PositionalGroupId> = {
  portero: "GK", portera: "GK", goalkeeper: "GK", gk: "GK",
  "central derecho": "CB", "central izquierdo": "CB", central: "CB", "centre-back": "CB", "center back": "CB",
  "right centre-back": "CB", "left centre-back": "CB", cb: "CB", lcb: "CB", rcb: "CB",
  "lateral derecho": "FB", "lateral izquierdo": "FB", "right-back": "FB", "left-back": "FB",
  "full-back": "FB", lateral: "FB", rb: "FB", lb: "FB", rwb: "FB", lwb: "FB",
  "mediocentro defensivo": "DMF", "defensive midfielder": "DMF", pivote: "DMF",
  dmf: "DMF", ldmf: "DMF", rdmf: "DMF", cdm: "DMF", dm: "DMF",
  mediocentro: "CMF", centrocampista: "CMF", "central midfielder": "CMF", interior: "CMF",
  cmf: "CMF", lcmf: "CMF", rcmf: "CMF", cm: "CMF", mf: "CMF",
  mediapunta: "AMF", "attacking midfielder": "AMF", amf: "AMF", lamf: "AMF", ramf: "AMF", cam: "AMF", omf: "AMF",
  "extremo derecho": "W", "extremo izquierdo": "W", "right winger": "W", "left winger": "W",
  extremo: "W", winger: "W", rw: "W", lw: "W", rwf: "W", lwf: "W", win: "W", w: "W",
  delantero: "CF", delantera: "CF", "delantero centro": "CF", striker: "CF",
  "centre-forward": "CF", "second striker": "CF", cf: "CF", st: "CF",
};

const GRUPO_TO_CONFIG: Record<string, PositionalGroupId> = {
  Porteros: "GK",
  Centrales: "CB",
  Laterales: "FB",
  Medios: "CMF",
  Mediapuntas: "AMF",
  Extremos: "W",
  Delanteros: "CF",
};

export function positionalConfigFor(
  position?: string | null,
  grupo?: string | null
): PositionalConfig {
  const clean = position?.trim().toLowerCase() || "";
  if (clean && POS_TO_CONFIG[clean]) return POSITIONAL_CONFIGS[POS_TO_CONFIG[clean]];
  if (clean.includes("defensivo") || clean.includes("cdm") || clean.includes("pivote")) return POSITIONAL_CONFIGS.DMF;
  if (clean.includes("porter") || clean.includes("keeper")) return POSITIONAL_CONFIGS.GK;
  if (clean.includes("central")) return POSITIONAL_CONFIGS.CB;
  if (clean.includes("lateral") || clean.includes("back")) return POSITIONAL_CONFIGS.FB;
  if (clean.includes("mediapunta") || clean.includes("attacking")) return POSITIONAL_CONFIGS.AMF;
  if (clean.includes("extremo") || clean.includes("winger")) return POSITIONAL_CONFIGS.W;
  if (clean.includes("delanter") || clean.includes("striker") || clean.includes("forward")) return POSITIONAL_CONFIGS.CF;
  if (grupo && GRUPO_TO_CONFIG[grupo]) return POSITIONAL_CONFIGS[GRUPO_TO_CONFIG[grupo]];
  return POSITIONAL_CONFIGS.CMF;
}
