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
  invert?: boolean; // true when lower values are better (e.g. goals conceded, xG conceded)
}

const INVERT_KEYS = new Set(["def_goles_encajados_p90", "def_xg_contra_p90", "def_goles_menos_xgc_p90"]);

export interface RadarTemplate {
  id: RadarTemplateId;
  name: string;
  grupo: string; // pipeline position group (player_season_stats.grupo_demarcacion) used as comparison pool
  stats: RadarStat[];
}

const s = (key: string, label: string, ref: string, weight: number, isPct = false): RadarStat => ({
  key,
  label,
  ref,
  weight,
  isPct,
  invert: INVERT_KEYS.has(key),
});

/** Metrics not stored by the pipeline, computed from stored ones */
export const DERIVED: Record<string, (m: Record<string, [number, number]>) => number | null> = {
  // Goal conversion %: goals / shots
  goal_conversion_pct: (m) => {
    const g = m.of_goles_p90?.[0];
    const sh = m.of_tiros_p90?.[0];
    return g != null && sh != null && sh > 0 ? (g / sh) * 100 : null;
  },
};

// Weights by priority (same as pipeline/categorias.py PLANTILLAS_POSICION): the 8 stats of each position in
// order + extras (xG, goals and goals − xG for AMF/W/CF, xCA for DMF/CMF/AMF, goals − xG conceded for GK).
const ORDER = [0.17, 0.15, 0.14, 0.13, 0.12, 0.11, 0.09, 0.09];
const EXTRA = 0.14;
type Def = [key: string, label: string, ref: string];
const tpl = (stats: Def[], extras: Def[] = []): RadarStat[] => [
  ...stats.map(([k, l, r], i) => s(k, l, r, ORDER[i] ?? 0.09)),
  ...extras.filter(([k]) => !stats.some(([x]) => x === k)).map(([k, l, r]) => s(k, l, r, EXTRA)),
];
const XG: Def = ["of_xG_p90", "xG", "expectedGoals"];
const GOALS: Def = ["of_goles_p90", "Goals", "goals"];
const G_XG: Def = ["of_goles_menos_xg_p90", "Goals − xG", "goals − expectedGoals"];
const XCA: Def = ["of_xCA_p90", "xCA", "Expected chain value (passes)"];

export const RADAR_TEMPLATES: Record<RadarTemplateId, RadarTemplate> = {
  GK: {
    id: "GK", name: "Goalkeeper", grupo: "Porteros", stats: [
      s("def_goles_menos_xgc_p90", "Goals − xG conceded", "goalsConceded − expectedGoalsConceded", 0.22),
      s("def_paradas_pct", "Save %", "savePercentage", 0.16, true),
      s("def_paradas_p90", "Saves", "saves", 0.14),
      s("def_paradas_ocasiones_claras_p90", "Big chance saves", "bigChanceSaves", 0.10),
      s("def_paradas_area_p90", "Saves inside box", "savedIbox", 0.08),
      s("def_salidas_libero_p90", "Sweeper actions", "accurateKeeperSweeper", 0.08),
      s("def_goles_encajados_p90", "Goals conceded", "goalsConceded", 0.05),
      s("of_pases_buenos_p90", "Accurate passes", "accuratePass", 0.07),
      s("of_envios_largos_p90", "Accurate launches", "accurateLaunches", 0.05),
      s("of_saques_puerta_pct", "Goal kick accuracy %", "accurateGoalKicksPct", 0.05, true),
    ],
  },
  CB: {
    id: "CB", name: "Centre-Back", grupo: "Centrales", stats: tpl([
      ["def_duelos_ganados_p90", "Duels won", "duelWon"],
      ["def_aereos_ganados_p90", "Aerials won", "aerialWon"],
      ["def_intercepciones_p90", "Interceptions", "interception"],
      ["def_despejes_p90", "Clearances", "effectiveClearance"],
      ["of_pases_buenos_p90", "Accurate passes", "accuratePass"],
      ["of_pases_rival_buenos_p90", "Passes opp. half", "accurateFwdZonePass"],
      ["of_pases_largos_p90", "Long balls", "accurateLongBalls"],
      ["of_toques_p90", "Touches", "touches"],
    ]),
  },
  FB: {
    id: "FB", name: "Full-Back / Wing-Back", grupo: "Laterales", stats: tpl([
      ["of_xA_p90", "xA", "expectedAssists"],
      ["of_centros_buenos_p90", "Accurate crosses", "accurateCross"],
      ["of_toques_area_rival_p90", "Touches opp. box", "touchesInOppBox"],
      ["of_entradas_ultimo_tercio_p90", "Final third entries", "finalThirdEntries"],
      ["of_pases_rival_buenos_p90", "Passes opp. half", "accurateFwdZonePass"],
      ["def_duelos_ganados_p90", "Duels won", "duelWon"],
      ["def_recuperaciones_p90", "Recoveries", "ballRecovery"],
      ["def_intercepciones_p90", "Interceptions", "interception"],
    ]),
  },
  DMF: {
    id: "DMF", name: "Defensive Midfielder", grupo: "Medios", stats: tpl([
      ["def_duelos_ganados_p90", "Duels won", "duelWon"],
      ["def_aereos_ganados_p90", "Aerials won", "aerialWon"],
      ["def_intercepciones_p90", "Interceptions", "interception"],
      ["def_recuperaciones_p90", "Recoveries", "ballRecovery"],
      ["of_toques_p90", "Touches", "touches"],
      ["of_pases_buenos_p90", "Accurate passes", "accuratePass"],
      ["of_pases_rival_buenos_p90", "Passes opp. half", "accurateFwdZonePass"],
      ["of_toques_area_rival_p90", "Touches opp. box", "touchesInOppBox"],
    ], [XCA]),
  },
  CMF: {
    id: "CMF", name: "Central Midfielder", grupo: "Medios", stats: [
      s("of_xCA_p90", "xCA", "Expected chain value (passes)", 0.14),
      s("of_pases_buenos_p90", "Accurate passes", "accuratePass", 0.13),
      s("of_progresivos_p90", "Progressive passes", "progressivePasses", 0.12),
      s("def_recuperaciones_p90", "Recoveries", "ballRecovery", 0.12),
      s("of_xA_p90", "xA", "expectedAssists", 0.11),
      s("of_toques_p90", "Touches", "touches", 0.10),
      s("of_grandes_ocasiones_creadas_p90", "Big chances created", "bigChanceCreated", 0.10),
      s("of_toques_area_rival_p90", "Touches opp. box", "touchesInOppBox", 0.09),
      s("of_xG_p90", "xG", "expectedGoals", 0.05),
      s("of_goles_p90", "Goals", "goals", 0.04),
    ],
  },
  AMF: {
    id: "AMF", name: "Attacking Midfielder", grupo: "Mediapuntas", stats: tpl([
      ["of_toques_area_rival_p90", "Touches opp. box", "touchesInOppBox"],
      ["of_toques_p90", "Touches", "touches"],
      GOALS,
      ["of_asistencia_gol_p90", "Assists", "goalAssist"],
      XG,
      ["of_grandes_ocasiones_creadas_p90", "Big chances created", "bigChanceCreated"],
      ["of_regates_p90", "Dribbles won", "wonContest"],
      ["of_xA_p90", "xA", "expectedAssists"],
    ], [XCA, G_XG]),
  },
  W: {
    id: "W", name: "Winger", grupo: "Extremos", stats: [
      s("of_goles_p90", "Goals", "goals", 0.16),
      s("of_xG_p90", "xG", "expectedGoals", 0.14),
      s("of_asistencia_gol_p90", "Assists", "goalAssist", 0.14),
      s("of_regates_p90", "Dribbles won", "wonContest", 0.13),
      s("of_xA_p90", "xA", "expectedAssists", 0.12),
      s("of_grandes_ocasiones_creadas_p90", "Big chances created", "bigChanceCreated", 0.10),
      s("of_centros_buenos_p90", "Accurate crosses", "accurateCross", 0.08),
      s("of_entradas_area_p90", "Box entries", "penAreaEntries", 0.07),
      s("of_goles_menos_xg_p90", "Goals − xG", "goals − expectedGoals", 0.06),
    ],
  },
  CF: {
    id: "CF", name: "Centre-Forward", grupo: "Delanteros", stats: tpl([
      GOALS,
      XG,
      ["of_asistencia_gol_p90", "Assists", "goalAssist"],
      ["of_xA_p90", "xA", "expectedAssists"],
      ["of_tiros_puerta_area_p90", "Box shots on target", "attIboxTarget"],
      ["of_toques_area_rival_p90", "Touches opp. box", "touchesInOppBox"],
      ["of_toques_p90", "Touches", "touches"],
      ["def_aereos_ganados_p90", "Aerials won", "aerialWon"],
    ], [G_XG]),
  },
};

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
