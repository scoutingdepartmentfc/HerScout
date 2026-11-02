import React from "react";
import { Activity } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { notaClases } from "@/lib/notaColor";

// Football Manager physical attributes (1-20), shown 0-100 (x5) like FMInside
const ATRIBUTOS: { key: string; name: string; help: string }[] = [
  { key: "acceleration", name: "Acceleration", help: "How quickly she reaches her top speed from a standing start" },
  { key: "agility", name: "Agility", help: "How well she starts, stops and turns" },
  { key: "balance", name: "Balance", help: "How well she stays on her feet under physical pressure" },
  { key: "jumping_reach", name: "Jumping Reach", help: "How high her head reaches when jumping" },
  { key: "natural_fitness", name: "Natural Fitness", help: "How well she recovers between matches and from injury" },
  { key: "pace", name: "Pace", help: "Her top speed" },
  { key: "stamina", name: "Stamina", help: "How well she keeps her fitness during a match or training" },
  { key: "strength", name: "Strength", help: "How well she exerts physical force on an opponent" },
];

// EA SPORTS FC ratings (1-99): the two card facets and the attributes behind them
const EA_GRUPOS: { key: string; name: string; attrs: { key: string; name: string }[] }[] = [
  { key: "pace", name: "Pace", attrs: [{ key: "acceleration", name: "Acceleration" }, { key: "sprint_speed", name: "Sprint Speed" }] },
  {
    key: "physicality", name: "Physicality", attrs: [
      { key: "jumping", name: "Jumping" }, { key: "stamina", name: "Stamina" },
      { key: "strength", name: "Strength" }, { key: "aggression", name: "Aggression" },
    ],
  },
];

function Fila({ name, n, help, title, strong }: { name: string; n: number | null; help?: string; title?: string; strong?: boolean }) {
  const c = notaClases(n);
  return (
    <div className="flex items-center justify-between gap-3 text-xs" title={help}>
      <span className={strong ? "font-semibold text-foreground" : "text-muted-foreground"}>{name}</span>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 rounded-full bg-navy-800 overflow-hidden">
          {n != null && <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${n}%` }} />}
        </div>
        <span className={`w-7 text-right font-bold tabular-nums ${c.text}`} title={title}>
          {n ?? "—"}
        </span>
      </div>
    </div>
  );
}

const num = (v: any) => (v != null ? Number(v) : null);

export function FisicoFM({ physical, ea }: { physical: Record<string, any> | null; ea?: Record<string, any> | null }) {
  return (
    <Card className="bg-[#0b1329]">
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> Physical
        </CardTitle>
        <CardDescription>Football Manager attributes (1–20, shown out of 100) and EA SPORTS FC ratings (1–99)</CardDescription>
      </CardHeader>
      <CardContent className="p-4 space-y-5">
        {!physical && !ea && <p className="text-xs text-muted-foreground">No physical data imported for this player.</p>}
        {physical && (
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {ATRIBUTOS.map((a) => {
              const v = num(physical[a.key]);
              return <Fila key={a.key} name={a.name} help={a.help} n={v != null ? Math.round(v * 5) : null}
                           title={v != null ? `${v}/20` : undefined} />;
            })}
          </div>
        )}
        {ea && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              EA SPORTS FC{ea.edition ? ` ${ea.edition}` : ""}
            </p>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {EA_GRUPOS.map((g) => (
                <div key={g.key} className="space-y-2">
                  <Fila name={g.name} n={num(ea[g.key])} strong />
                  {g.attrs.map((a) => <Fila key={a.key} name={a.name} n={num(ea[a.key])} />)}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
