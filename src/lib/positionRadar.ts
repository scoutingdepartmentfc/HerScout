/**
 * Position radar templates: the stats (and weights) that matter for each position, as defined by the
 * scouting department (Wyscout-style list). Each stat is mapped to the closest Opta metric the pipeline
 * computes (radar_data.metricas). `ref` keeps the original stat name when the Opta metric is a proxy.
 * Weights per template add up to ~1.
 */

export type RadarTemplateId = "GK" | "CB" | "FB" | "DMF" | "CMF" | "AMF" | "W" | "CF";

export interface RadarStat {
  key: string; // metric key in radar_data.metricas, or a derived key (see DERIVED)
  label: string; // short axis label
  ref: string; // stat name in the department's list
  weight: number;
  isPct?: boolean;
}

export interface RadarTemplate {
  id: RadarTemplateId;
  name: string;
  grupo: string; // pipeline position group (player_season_stats.grupo_demarcacion) used as comparison pool
  stats: RadarStat[];
}

const s = (key: string, label: string, ref: string, weight: number, isPct = false): RadarStat => ({ key, label, ref, weight, isPct });

/** Metrics not stored by the pipeline, computed from stored ones */
export const DERIVED: Record<string, (m: Record<string, [number, number]>) => number | null> = {
  // Goal conversion %: goals / shots
  goal_conversion_pct: (m) => {
    const g = m.of_goles_p90?.[0];
    const sh = m.of_tiros_p90?.[0];
    return g != null && sh != null && sh > 0 ? (g / sh) * 100 : null;
  },
};

const FB: RadarStat[] = [
  s("def_recuperaciones_p90", "Def. actions", "Successful defensive actions per 90", 0.1),
  s("def_entradas_pct", "Def. duels won %", "Defensive duels won, %", 0.2, true),
  s("of_centros_buenos_p90", "Crosses", "Crosses per 90", 0.1),
  s("of_centros_buenos_pct", "Cross acc. %", "Accurate crosses, %", 0.2, true),
  s("of_conduccion_pase_p90", "Progressive runs", "Progressive runs per 90", 0.1),
  s("of_progresivos_p90", "Passes to final 3rd", "Passes to final third per 90", 0.2),
  s("of_regates_p90", "Offensive duels", "Offensive duels per 90", 0.1),
];
const DMF: RadarStat[] = [
  s("def_recuperaciones_p90", "Def. actions", "Successful defensive actions per 90", 0.1),
  s("def_intercepciones_p90", "Interceptions", "Interceptions per 90", 0.1),
  s("def_entradas_pct", "Duels won %", "Duels won, %", 0.2, true),
  s("of_pases_pct", "Pass acc. %", "Accurate passes, %", 0.2, true),
  s("of_progresivos_pct", "Fwd pass acc. %", "Accurate forward passes, %", 0.2, true),
  s("of_progresivos_p90", "Progressive passes", "Progressive passes per 90", 0.1),
  s("of_participacion_pct", "Involvement", "Received passes per 90", 0.1, true),
];
const W: RadarStat[] = [
  s("of_regates_p90", "Dribbles", "Dribbles per 90", 0.2),
  s("of_regates_pct", "Dribble success %", "Successful dribbles, %", 0.1, true),
  s("of_centros_buenos_p90", "Crosses", "Crosses per 90", 0.1),
  s("of_centros_buenos_pct", "Cross acc. %", "Accurate crosses, %", 0.2, true),
  s("of_xA_p90", "xA", "xA per 90", 0.1),
  s("of_tiros_p90", "Shots", "Shots per 90", 0.1),
  s("of_xG_p90", "xG", "xG per 90", 0.2),
];

export const RADAR_TEMPLATES: Record<RadarTemplateId, RadarTemplate> = {
  GK: {
    id: "GK", name: "Goalkeeper", grupo: "Porteros", stats: [
      s("def_paradas_pct", "Save rate %", "Save rate, %", 0.2, true),
      s("def_paradas_ocasiones_claras_p90", "Big-chance saves", "Prevented goals per 90", 0.2),
      s("def_porteria_cero_pct", "Clean sheets %", "Clean sheets", 0.1, true),
      s("def_salidas_libero_p90", "Exits", "Exits per 90", 0.1),
      s("of_pases_pct", "Pass acc. %", "Accurate passes, %", 0.2, true),
      s("of_pases_largos_pct", "Long pass acc. %", "Accurate long passes, %", 0.1, true),
      s("of_progresivos_p90", "Forward passes", "Forward passes per 90", 0.1),
    ],
  },
  CB: {
    id: "CB", name: "Centre-Back", grupo: "Centrales", stats: [
      s("def_entradas_p90", "Def. duels", "Defensive duels per 90", 0.1),
      s("def_entradas_pct", "Def. duels won %", "Defensive duels won, %", 0.2, true),
      s("def_aereos_ganados_pct", "Aerials won %", "Aerial duels won, %", 0.1, true),
      s("def_intercepciones_p90", "Interceptions", "Interceptions per 90", 0.1),
      s("def_despejes_area_prop_p90", "Box clearances", "Shots blocked per 90", 0.1),
      s("of_pases_pct", "Pass acc. %", "Accurate passes, %", 0.2, true),
      s("of_progresivos_p90", "Passes to final 3rd", "Passes to final third per 90", 0.2),
    ],
  },
  FB: { id: "FB", name: "Full-Back / Wing-Back", grupo: "Laterales", stats: FB },
  DMF: { id: "DMF", name: "Defensive Midfielder", grupo: "Medios", stats: DMF },
  CMF: {
    id: "CMF", name: "Central Midfielder", grupo: "Medios", stats: [
      s("of_pases_buenos_p90", "Passes", "Passes per 90", 0.12),
      s("of_pases_pct", "Pass acc. %", "Accurate passes, %", 0.2, true),
      s("of_xA_p90", "xA", "xA per 90", 0.12),
      s("of_pases_rival_buenos_p90", "Passes final 3rd", "Passes to final third per 90", 0.2),
      s("of_asistencias_p90", "Shot assists", "Shot assists per 90", 0.12),
      s("def_entradas_pct", "Duels won %", "Duels won, %", 0.12, true),
      s("of_progresivos_p90", "Progressive passes", "Progressive passes per 90", 0.12),
    ],
  },
  AMF: {
    id: "AMF", name: "Attacking Midfielder", grupo: "Mediapuntas", stats: [
      s("of_xA_p90", "xA", "xA per 90", 0.2),
      s("of_xG_p90", "xG", "xG per 90", 0.1),
      s("of_asistencias_p90", "Shot assists", "Shot assists per 90", 0.1),
      s("of_llegadas_area_pase_remate_p90", "Box arrivals", "Touches in box per 90", 0.2),
      s("of_goles_p90", "Goals", "Goals per 90", 0.1),
      s("of_pases_recibidos_carril_central_p90", "Received centrally", "Received passes per 90", 0.1),
      s("of_pases_dentro_area_p90", "Passes into box", "Accurate passes to penalty area, %", 0.2),
    ],
  },
  W: { id: "W", name: "Winger", grupo: "Extremos", stats: W },
  CF: {
    id: "CF", name: "Centre-Forward", grupo: "Delanteros", stats: [
      s("of_goles_p90", "Goals", "Non-penalty goals per 90", 0.1),
      s("of_xG_p90", "xG", "xG per 90", 0.2),
      s("goal_conversion_pct", "Conversion %", "Goal conversion, %", 0.2, true),
      s("of_tiros_p90", "Shots", "Shots per 90", 0.1),
      s("of_llegadas_area_pase_remate_p90", "Box arrivals", "Touches in box per 90", 0.1),
      s("of_regates_pct", "Off. duels won %", "Offensive duels won, %", 0.1, true),
      s("of_tiros_dentro_pct", "Shots on target %", "Shots on target, %", 0.2, true),
    ],
  },
};

/** Player position (pipeline Spanish demarcación, English name or short code) → radar template */
const POSITION_TEMPLATE: Record<string, RadarTemplateId> = {
  portero: "GK", portera: "GK", goalkeeper: "GK", gk: "GK",
  "central derecho": "CB", "central izquierdo": "CB", central: "CB", "centre-back": "CB", "center back": "CB",
  cb: "CB", lcb: "CB", rcb: "CB",
  "lateral derecho": "FB", "lateral izquierdo": "FB", "right-back": "FB", "left-back": "FB",
  rb: "FB", lb: "FB", rwb: "FB", lwb: "FB",
  "mediocentro defensivo": "DMF", "defensive midfielder": "DMF", dmf: "DMF", ldmf: "DMF", rdmf: "DMF", cdm: "DMF", dm: "DMF",
  mediocentro: "CMF", centrocampista: "CMF", "central midfielder": "CMF", cmf: "CMF", lcmf: "CMF", rcmf: "CMF", cm: "CMF",
  mediapunta: "AMF", "attacking midfielder": "AMF", amf: "AMF", lamf: "AMF", ramf: "AMF", cam: "AMF", am: "AMF",
  "extremo derecho": "W", "extremo izquierdo": "W", "right winger": "W", "left winger": "W",
  rw: "W", lw: "W", rwf: "W", lwf: "W",
  delantero: "CF", delantera: "CF", striker: "CF", "centre-forward": "CF", cf: "CF", st: "CF",
};

const GRUPO_TEMPLATE: Record<string, RadarTemplateId> = {
  Porteros: "GK", Centrales: "CB", Laterales: "FB", Medios: "CMF", Mediapuntas: "AMF", Extremos: "W", Delanteros: "CF",
};

export function templateFor(position?: string | null, grupo?: string | null): RadarTemplate {
  const id = (position && POSITION_TEMPLATE[position.trim().toLowerCase()]) || (grupo && GRUPO_TEMPLATE[grupo]) || "CMF";
  return RADAR_TEMPLATES[id];
}

export function statValue(metricas: Record<string, [number, number]> | null | undefined, key: string): number | null {
  if (!metricas) return null;
  if (DERIVED[key]) return DERIVED[key](metricas);
  const v = metricas[key]?.[0];
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
}
