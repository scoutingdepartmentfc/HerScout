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

export function FisicoFM({ physical }: { physical: Record<string, any> | null }) {
  return (
    <Card className="bg-[#0b1329]">
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> Physical
        </CardTitle>
        <CardDescription>Football Manager attributes (1–20, shown out of 100)</CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        {!physical ? (
          <p className="text-xs text-muted-foreground">No physical data imported for this player.</p>
        ) : (
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {ATRIBUTOS.map((a) => {
              const v = physical[a.key] != null ? Number(physical[a.key]) : null;
              const n = v != null ? Math.round(v * 5) : null;
              const c = notaClases(n);
              return (
                <div key={a.key} className="flex items-center justify-between gap-3 text-xs" title={a.help}>
                  <span className="text-muted-foreground">{a.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 rounded-full bg-navy-800 overflow-hidden">
                      {n != null && <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${n}%` }} />}
                    </div>
                    <span className={`w-7 text-right font-bold tabular-nums ${c.text}`} title={v != null ? `${v}/20` : undefined}>
                      {n ?? "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
