"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { Bandera } from "@/components/scouting/Bandera";

export interface FilterOption {
  id: string;
  name: string;
  country?: string | null;
  badgeUrl?: string | null;
  count?: number;
}

interface MultiSelectFilterProps {
  label: string;
  placeholder?: string;
  options: FilterOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  showFlag?: boolean;
  compact?: boolean;
}

export const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({
  label,
  placeholder = "Select...",
  options,
  selectedIds,
  onChange,
  showFlag = false,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(search.toLowerCase()) ||
    (opt.country && opt.country.toLowerCase().includes(search.toLowerCase()))
  );

  const groupedByCountry = React.useMemo(() => {
    if (!showFlag) return null;
    const hasAnyCountry = options.some((o) => !!o.country);
    if (!hasAnyCountry) return null;

    const groups: { country: string; items: FilterOption[] }[] = [];
    const map = new Map<string, FilterOption[]>();

    for (const opt of filteredOptions) {
      const c = opt.country || "Other";
      if (!map.has(c)) {
        const list: FilterOption[] = [];
        map.set(c, list);
        groups.push({ country: c, items: list });
      }
      map.get(c)!.push(opt);
    }
    return groups;
  }, [options, filteredOptions, showFlag]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const toggleGroup = (items: FilterOption[]) => {
    const ids = items.map((x) => x.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      onChange(selectedIds.filter((id) => !ids.includes(id)));
    } else {
      const next = new Set([...selectedIds, ...ids]);
      onChange(Array.from(next));
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {!compact && (
        <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-9 px-3 rounded-lg border border-white/10 bg-navy-950/90 text-xs flex items-center justify-between gap-2 hover:border-emerald-500/50 hover:bg-navy-900 transition-all text-left shadow-sm"
      >
        <span className="truncate text-slate-200">
          {selectedIds.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : selectedIds.length === 1 ? (
            <span className="text-emerald-400 font-semibold inline-flex items-center gap-1.5">
              {showFlag && (() => {
                const o = options.find((x) => x.id === selectedIds[0]);
                return o?.country ? <Bandera country={o.country} size="xs" /> : null;
              })()}
              {selectedIds[0]}
            </span>
          ) : (
            <span className="text-emerald-400 font-semibold">{selectedIds.length} selected</span>
          )}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selectedIds.length > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-72 rounded-xl border border-white/15 bg-[#0a1224]/95 backdrop-blur-xl shadow-2xl z-50 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-white/10 bg-navy-950/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder={`Search ${label.toLowerCase()}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 pl-8 pr-2 bg-black/40 border border-white/10 rounded-md text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No results
              </div>
            ) : groupedByCountry ? (
              groupedByCountry.map((grp) => {
                const groupIds = grp.items.map((x) => x.id);
                const countSelected = groupIds.filter((id) => selectedIds.includes(id)).length;
                const isAllSelected = countSelected === groupIds.length;
                const isPartiallySelected = countSelected > 0 && !isAllSelected;

                return (
                  <div key={grp.country} className="rounded-lg bg-white/[0.02] border border-white/5 overflow-hidden">
                    <div className="flex items-center justify-between px-2 py-1 bg-white/[0.04] border-b border-white/5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {grp.country !== "Other" && <Bandera country={grp.country} size="xs" />}
                        <span className="text-[10.5px] font-bold text-slate-200 tracking-wide uppercase truncate">
                          {grp.country}
                        </span>
                        <span className="text-[10px] text-slate-500 tabular-nums">({grp.items.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleGroup(grp.items)}
                        className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors px-1"
                      >
                        {isAllSelected ? "Clear" : isPartiallySelected ? `${countSelected}/${groupIds.length}` : "All"}
                      </button>
                    </div>

                    <div className="p-1 space-y-0.5">
                      {grp.items.map((opt) => {
                        const isSelected = selectedIds.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggle(opt.id)}
                            className={`w-full py-1 px-2 rounded-md flex items-center justify-between text-left text-xs transition-colors ${
                              isSelected
                                ? "bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30"
                                : "text-slate-300 hover:bg-white/5 border border-transparent"
                            }`}
                          >
                            <span className="truncate pr-2">{opt.name}</span>
                            <div
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? "bg-emerald-500 border-emerald-400 text-gray-950"
                                  : "border-white/20 bg-navy-950"
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedIds.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(opt.id)}
                    className={`w-full py-1.5 px-2 rounded-lg flex items-center justify-between text-left text-xs transition-colors ${
                      isSelected
                        ? "bg-emerald-500/15 text-emerald-300 font-semibold"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      {showFlag && (
                        <div className="shrink-0 w-5 flex items-center justify-center">
                          {opt.country ? <Bandera country={opt.country} size="sm" /> : <span className="w-5 h-3.5 rounded-sm bg-white/10" />}
                        </div>
                      )}
                      {opt.badgeUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={opt.badgeUrl} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />
                      )}
                      <span className="truncate">{opt.name}</span>
                      {opt.count != null && <span className="text-[10px] text-slate-500 tabular-nums">{opt.count}</span>}
                    </div>
                    <div
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "bg-emerald-500 border-emerald-400 text-gray-950"
                          : "border-white/20 bg-navy-950"
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {selectedIds.length > 0 && (
            <div className="p-2 border-t border-white/10 bg-navy-950 flex justify-between items-center text-[11px] px-3">
              <span className="text-muted-foreground">{selectedIds.length} selected</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-emerald-400 hover:text-emerald-300 font-semibold"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
