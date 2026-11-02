// Scoring scale palette:
// 90-100: Indigo / Purple (#6366F1 / #7068FF)
// 80-89:  Bright Mint / Green (#00E676 / #10B981)
// 72-79:  Medium / Emerald Green (#00C853 / #059669)
// 60-71:  Amber / Yellow-Orange (#FFB300 / #F59E0B)
// 0-59:   White / Neutral (#FFFFFF / #F8FAFC)
export type NotaTono = "purple" | "mint" | "green" | "amber" | "white" | "nulo";

export function notaTono(v: number | null | undefined): NotaTono {
  if (v == null || Number.isNaN(v)) return "nulo";
  const r = Math.round(v);
  if (r >= 90) return "purple";
  if (r >= 80) return "mint";
  if (r >= 72) return "green";
  if (r >= 60) return "amber";
  return "white";
}

const CLASES: Record<NotaTono, { text: string; bar: string; box: string; badge: string }> = {
  purple: {
    text: "text-score-purple",
    bar: "bg-score-purple",
    box: "border-score-purple/40 bg-score-purple/15",
    badge: "bg-score-purple/20 text-[#8B85FF] border-score-purple/40",
  },
  mint: {
    text: "text-score-mint",
    bar: "bg-score-mint",
    box: "border-score-mint/40 bg-score-mint/15",
    badge: "bg-score-mint/20 text-score-mint border-score-mint/40",
  },
  green: {
    text: "text-score-green",
    bar: "bg-score-green",
    box: "border-score-green/40 bg-score-green/15",
    badge: "bg-score-green/20 text-score-green border-score-green/40",
  },
  amber: {
    text: "text-score-amber",
    bar: "bg-score-amber",
    box: "border-score-amber/40 bg-score-amber/15",
    badge: "bg-score-amber/20 text-score-amber border-score-amber/40",
  },
  white: {
    text: "text-white",
    bar: "bg-white",
    box: "border-white/30 bg-white/10",
    badge: "bg-white/15 text-white border-white/30",
  },
  nulo: {
    text: "text-muted-foreground",
    bar: "bg-muted",
    box: "border-border",
    badge: "bg-slate-800 text-slate-400 border-slate-700",
  },
};

export function notaClases(v: number | null | undefined) {
  return CLASES[notaTono(v)];
}

