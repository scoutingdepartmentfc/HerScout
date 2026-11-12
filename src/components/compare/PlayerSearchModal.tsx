import React, { useState, useMemo } from "react";
import { Search, X, Check, Filter } from "lucide-react";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { LogoLiga } from "@/components/scouting/LogoLiga";

interface PlayerSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlayer: (player: any) => void;
  allPlayers: any[];
  alreadySelectedIds: string[];
}

export const PlayerSearchModal: React.FC<PlayerSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectPlayer,
  allPlayers,
  alreadySelectedIds,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");

  const filtered = useMemo(() => {
    let list = allPlayers || [];

    if (positionFilter !== "all") {
      list = list.filter((p) => {
        const pos = (p.position || p.primary_position || "").toLowerCase();
        if (positionFilter === "gk") return pos.includes("porter") || pos.includes("keeper") || pos === "gk";
        if (positionFilter === "def") return pos.includes("central") || pos.includes("lateral") || pos.includes("defen");
        if (positionFilter === "mid") return pos.includes("medio") || pos.includes("pivote") || pos.includes("interior") || pos.includes("mediapunta");
        if (positionFilter === "att") return pos.includes("delanter") || pos.includes("extremo") || pos.includes("striker");
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const name = (p.name || "").toLowerCase();
        const mName = (p.matchName || p.match_name || "").toLowerCase();
        const team = (p.teamName || p.teams?.name || "").toLowerCase();
        return name.includes(q) || mName.includes(q) || team.includes(q);
      });
    }

    return list.slice(0, 40);
  }, [allPlayers, searchQuery, positionFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl bg-[#070e1e] border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Select Player to Compare</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose from players with verified Opta metrics and ratings
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search input & position filter */}
        <div className="p-4 border-b border-border/40 bg-navy-950/40 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, team or league..."
              className="w-full pl-9 pr-4 py-2 bg-[#0b1329] border border-border/60 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-primary/60"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-1 bg-[#0b1329] p-1 rounded-xl border border-border/60 text-xs shrink-0">
            {[
              { id: "all", label: "All" },
              { id: "gk", label: "GK" },
              { id: "def", label: "DEF" },
              { id: "mid", label: "MID" },
              { id: "att", label: "ATT" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPositionFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  positionFilter === tab.id
                    ? "bg-primary/20 text-primary border border-primary/40 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Player List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-white/10">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No players found matching your criteria.
            </div>
          ) : (
            filtered.map((p) => {
              const isSelected = alreadySelectedIds.includes(p.id);
              const score = p.notaGlobal ?? p.rating ?? null;

              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={isSelected}
                  onClick={() => {
                    onSelectPlayer(p);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "opacity-40 cursor-not-allowed bg-slate-900/40 border-transparent"
                      : "bg-[#0b1329]/80 border-border/40 hover:bg-white/[0.04] hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-slate-900 shrink-0 flex items-center justify-center">
                      {p.photoUrl || p.photo_url ? (
                        <img
                          src={p.photoUrl || p.photo_url}
                          alt={p.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="font-bold text-white text-xs">
                          {p.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">
                        {p.matchName || p.match_name || p.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
                        <EscudoEquipo
                          badgeUrl={p.badgeUrl || p.teams?.badge_url}
                          name={p.teamName || p.teams?.name}
                          size={13}
                        />
                        <span>{p.teamName || p.teams?.name || "Unattached"}</span>
                        <span>·</span>
                        <span>{p.position || p.primary_position || "Player"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {score != null && (
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                        {Math.round(score)}
                      </span>
                    )}

                    {isSelected ? (
                      <span className="text-[10px] text-slate-500 font-semibold px-2 py-0.5 rounded border border-white/10">
                        Added
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Select
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

