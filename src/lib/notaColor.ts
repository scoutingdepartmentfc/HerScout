// Colour of a 0-100 rating. Ratings are relative to the league average (average player ≈ 62):
// >= 70 green, 50-70 orange, < 50 red.
export type NotaTono = "verde" | "naranja" | "rojo" | "nulo";

export function notaTono(v: number | null | undefined): NotaTono {
  if (v == null || Number.isNaN(v)) return "nulo";
  const r = Math.round(v);
  if (r >= 70) return "verde";
  if (r >= 50) return "naranja";
  return "rojo";
}

const CLASES: Record<NotaTono, { text: string; bar: string; box: string; badge: string }> = {
  verde: {
    text: "text-emerald-400",
    bar: "bg-emerald-500",
    box: "border-emerald-500/30 bg-emerald-500/10",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  },
  naranja: {
    text: "text-orange-400",
    bar: "bg-orange-500",
    box: "border-orange-500/30 bg-orange-500/10",
    badge: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  },
  rojo: {
    text: "text-red-400",
    bar: "bg-red-500",
    box: "border-red-500/20 bg-red-500/10",
    badge: "bg-red-500/15 text-red-300 border-red-500/30",
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
