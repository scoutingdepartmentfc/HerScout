"use client";

import React, { useState } from "react";
import { Check, ChevronDown, Eye, Plus } from "lucide-react";
import { useCurrentScout } from "@/lib/useCurrentScout";

/** "Viewing as <scout>" — who is filling in match reports, attendance and stars. */
export function ScoutSwitcher({ pillClass }: { pillClass: string }) {
  const { scouts, scout, select, create } = useCurrentScout();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    if (!name.trim()) return;
    try {
      setErr(null);
      await create(name.trim());
      setName("");
      setOpen(false);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={`${pillClass} text-muted-foreground hover:text-white`} title="Scout you are acting as">
        <Eye className="w-3.5 h-3.5 text-primary" />
        <span className="hidden md:inline font-display font-semibold uppercase tracking-wide max-w-[120px] truncate">
          {scout ? scout.name : "Select scout"}
        </span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 border border-border bg-card p-1 shadow-xl z-50">
          <div className="px-2 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
            Viewing as scout
          </div>
          <div className="max-h-60 overflow-y-auto">
            {scouts.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  select(s.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-left text-foreground hover:bg-secondary/60"
              >
                <span className="truncate">{s.name}</span>
                {scout?.id === s.id && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
            ))}
            {!scouts.length && <p className="px-2.5 py-2 text-[11px] text-muted-foreground">No scouts yet — add one below.</p>}
          </div>
          <div className="flex items-center gap-1 border-t border-border/60 p-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="New scout name"
              className="flex-1 min-w-0 bg-background border border-border px-2 py-1 text-xs text-white outline-none focus:border-primary"
            />
            <button onClick={add} className="p-1.5 bg-primary text-white" aria-label="Add scout">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {err && <p className="px-2.5 pb-1.5 text-[10px] text-red-400">{err}</p>}
        </div>
      )}
    </div>
  );
}
