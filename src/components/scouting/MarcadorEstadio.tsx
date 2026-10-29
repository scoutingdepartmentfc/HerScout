import React from "react";

export const MarcadorEstadio: React.FC<{
  celdas: {
    label: string;
    valor: number | null;
    principal?: boolean;
    subs?: { label: string; valor: number }[];
  }[];
}> = ({ celdas }) => {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border/80 bg-border/60 sm:grid-cols-3 xl:grid-cols-6">
      {celdas.map((c) => (
        <div
          key={c.label}
          className={`flex flex-col gap-2 p-3 ${
            c.principal ? "bg-[#070c18]" : "bg-[#0b1329]"
          }`}
        >
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {c.label}
          </span>
          <span
            className={`font-black text-3xl tabular-nums leading-none ${
              c.valor === null
                ? "text-muted-foreground/40"
                : c.principal
                ? "text-amber-400"
                : c.valor >= 80
                ? "text-emerald-400"
                : c.valor >= 65
                ? "text-sky-400"
                : "text-amber-300"
            }`}
          >
            {c.valor === null ? "—" : Math.round(c.valor)}
          </span>
          {!!c.subs?.length && (
            <ul className="space-y-1 border-t border-border/40 pt-2 text-[11px]">
              {c.subs.map((s) => (
                <li key={s.label} className="flex justify-between gap-1 text-muted-foreground">
                  <span className="truncate" title={s.label}>
                    {s.label}
                  </span>
                  <span className="font-semibold text-white tabular-nums">
                    {Math.round(s.valor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
};

