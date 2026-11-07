"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { StadiumPitch } from "@/components/builder/StadiumPitch";
import { PitchCard, PitchCardPlayer } from "@/components/builder/PitchCard";
import { MultiSelectFilter } from "@/components/builder/MultiSelectFilter";
import { CromoJugador } from "@/components/scouting/CromoJugador";
import { LoadingState } from "@/components/ui/StatusStates";
import { SlidersHorizontal, Trophy, RefreshCw, X, Sparkles, Filter, ChevronRight, Eye } from "lucide-react";
import { notaClases } from "@/lib/notaColor";

type FormationKey = "4-3-3" | "4-4-2" | "3-5-2" | "4-2-3-1" | "3-4-3" | "5-3-2";

interface PositionSlot {
  role: string;
  category: "GK" | "DEF" | "MID" | "ATT";
  acceptedPositions: string[];
}

const FORMATION_CONFIGS: Record<FormationKey, { name: string; lines: PositionSlot[][] }> = {
  "4-3-3": {
    name: "4-3-3",
    lines: [
      // Attack
      [
        { role: "LW", category: "ATT", acceptedPositions: ["LW", "LM", "Extremo Izquierdo", "Left Winger"] },
        { role: "ST", category: "ATT", acceptedPositions: ["ST", "CF", "Delantero", "Delantera", "Centre-Forward", "Striker"] },
        { role: "RW", category: "ATT", acceptedPositions: ["RW", "RM", "Extremo Derecho", "Right Winger"] },
      ],
      // Midfield
      [
        { role: "LCM", category: "MID", acceptedPositions: ["CM", "CAM", "Mediocentro", "Central Midfield"] },
        { role: "CDM", category: "MID", acceptedPositions: ["CDM", "CM", "Mediocentro Defensivo", "Defensive Midfield"] },
        { role: "RCM", category: "MID", acceptedPositions: ["CM", "CAM", "Mediocentro", "Central Midfield"] },
      ],
      // Defense
      [
        { role: "LB", category: "DEF", acceptedPositions: ["LB", "LWB", "Lateral Izquierdo", "Lateral", "Left-Back", "Left Wing-Back"] },
        { role: "LCB", category: "DEF", acceptedPositions: ["CB", "LCB", "RCB", "Central", "Central Izquierdo", "Central Derecho", "Centrales", "Centre-Back", "Defensa"] },
        { role: "RCB", category: "DEF", acceptedPositions: ["CB", "RCB", "LCB", "Central", "Central Derecho", "Central Izquierdo", "Centrales", "Centre-Back", "Defensa"] },
        { role: "RB", category: "DEF", acceptedPositions: ["RB", "RWB", "Lateral Derecho", "Lateral", "Right-Back", "Right Wing-Back"] },
      ],
      // Goalkeeper
      [
        { role: "GK", category: "GK", acceptedPositions: ["GK", "Portero", "Goalkeeper"] },
      ],
    ],
  },
  "4-4-2": {
    name: "4-4-2",
    lines: [
      [
        { role: "LS", category: "ATT", acceptedPositions: ["ST", "CF", "Delantero", "Delantera", "Striker"] },
        { role: "RS", category: "ATT", acceptedPositions: ["ST", "CF", "Delantero", "Delantera", "Striker"] },
      ],
      [
        { role: "LM", category: "MID", acceptedPositions: ["LM", "LW", "Extremo Izquierdo", "Left Winger", "Interior"] },
        { role: "LCM", category: "MID", acceptedPositions: ["CM", "CDM", "Mediocentro", "Central Midfield"] },
        { role: "RCM", category: "MID", acceptedPositions: ["CM", "CAM", "Mediocentro", "Central Midfield"] },
        { role: "RM", category: "MID", acceptedPositions: ["RM", "RW", "Extremo Derecho", "Right Winger", "Interior"] },
      ],
      [
        { role: "LB", category: "DEF", acceptedPositions: ["LB", "LWB", "Lateral Izquierdo", "Lateral", "Left-Back"] },
        { role: "LCB", category: "DEF", acceptedPositions: ["CB", "LCB", "RCB", "Central", "Central Izquierdo", "Central Derecho", "Centrales", "Centre-Back", "Defensa"] },
        { role: "RCB", category: "DEF", acceptedPositions: ["CB", "RCB", "LCB", "Central", "Central Derecho", "Central Izquierdo", "Centrales", "Centre-Back", "Defensa"] },
        { role: "RB", category: "DEF", acceptedPositions: ["RB", "RWB", "Lateral Derecho", "Lateral", "Right-Back"] },
      ],
      [
        { role: "GK", category: "GK", acceptedPositions: ["GK", "Portero", "Goalkeeper"] },
      ],
    ],
  },
  "4-2-3-1": {
    name: "4-2-3-1",
    lines: [
      [
        { role: "ST", category: "ATT", acceptedPositions: ["ST", "CF", "Delantero", "Delantera", "Striker"] },
      ],
      [
        { role: "LAM", category: "ATT", acceptedPositions: ["LW", "LM", "CAM", "Extremo Izquierdo"] },
        { role: "CAM", category: "MID", acceptedPositions: ["CAM", "Mediapunta", "CM", "Attacking Midfield"] },
        { role: "RAM", category: "ATT", acceptedPositions: ["RW", "RM", "CAM", "Extremo Derecho"] },
      ],
      [
        { role: "LDM", category: "MID", acceptedPositions: ["CDM", "CM", "Mediocentro Defensivo", "Pivote", "Defensive Midfield"] },
        { role: "RDM", category: "MID", acceptedPositions: ["CDM", "CM", "Mediocentro Defensivo", "Pivote", "Defensive Midfield"] },
      ],
      [
        { role: "LB", category: "DEF", acceptedPositions: ["LB", "LWB", "Lateral Izquierdo", "Lateral", "Left-Back"] },
        { role: "LCB", category: "DEF", acceptedPositions: ["CB", "LCB", "RCB", "Central", "Central Izquierdo", "Central Derecho", "Centrales", "Centre-Back", "Defensa"] },
        { role: "RCB", category: "DEF", acceptedPositions: ["CB", "RCB", "LCB", "Central", "Central Derecho", "Central Izquierdo", "Centrales", "Centre-Back", "Defensa"] },
        { role: "RB", category: "DEF", acceptedPositions: ["RB", "RWB", "Lateral Derecho", "Lateral", "Right-Back"] },
      ],
      [
        { role: "GK", category: "GK", acceptedPositions: ["GK", "Portero", "Goalkeeper"] },
      ],
    ],
  },
  "3-5-2": {
    name: "3-5-2",
    lines: [
      [
        { role: "LS", category: "ATT", acceptedPositions: ["ST", "CF", "Delantero", "Delantera"] },
        { role: "RS", category: "ATT", acceptedPositions: ["ST", "CF", "Delantero", "Delantera"] },
      ],
      [
        { role: "LWB", category: "MID", acceptedPositions: ["LM", "LB", "LWB", "Carrilero Izquierdo"] },
        { role: "LCM", category: "MID", acceptedPositions: ["CM", "CAM", "Mediocentro"] },
        { role: "CDM", category: "MID", acceptedPositions: ["CDM", "CM", "Mediocentro Defensivo", "Pivote"] },
        { role: "RCM", category: "MID", acceptedPositions: ["CM", "CAM", "Mediocentro"] },
        { role: "RWB", category: "MID", acceptedPositions: ["RM", "RB", "RWB", "Carrilero Derecho"] },
      ],
      [
        { role: "LCB", category: "DEF", acceptedPositions: ["CB", "LCB", "RCB", "Central", "Central Izquierdo", "Centrales", "Centre-Back", "Defensa"] },
        { role: "CB", category: "DEF", acceptedPositions: ["CB", "Central", "Central Izquierdo", "Central Derecho", "Centrales", "Centre-Back", "Defensa"] },
        { role: "RCB", category: "DEF", acceptedPositions: ["CB", "RCB", "LCB", "Central", "Central Derecho", "Centrales", "Centre-Back", "Defensa"] },
      ],
      [
        { role: "GK", category: "GK", acceptedPositions: ["GK", "Portero", "Goalkeeper"] },
      ],
    ],
  },
  "3-4-3": {
    name: "3-4-3",
    lines: [
      [
        { role: "LW", category: "ATT", acceptedPositions: ["LW", "LM", "Extremo Izquierdo"] },
        { role: "ST", category: "ATT", acceptedPositions: ["ST", "CF", "Delantero", "Delantera"] },
        { role: "RW", category: "ATT", acceptedPositions: ["RW", "RM", "Extremo Derecho"] },
      ],
      [
        { role: "LM", category: "MID", acceptedPositions: ["LM", "LW", "Extremo Izquierdo"] },
        { role: "LCM", category: "MID", acceptedPositions: ["CM", "CDM", "Mediocentro"] },
        { role: "RCM", category: "MID", acceptedPositions: ["CM", "CAM", "Mediocentro"] },
        { role: "RM", category: "MID", acceptedPositions: ["RM", "RW", "Extremo Derecho"] },
      ],
      [
        { role: "LCB", category: "DEF", acceptedPositions: ["CB", "LCB", "RCB", "Central", "Central Izquierdo", "Centrales", "Centre-Back", "Defensa"] },
        { role: "CB", category: "DEF", acceptedPositions: ["CB", "Central", "Central Izquierdo", "Central Derecho", "Centrales", "Centre-Back", "Defensa"] },
        { role: "RCB", category: "DEF", acceptedPositions: ["CB", "RCB", "LCB", "Central", "Central Derecho", "Centrales", "Centre-Back", "Defensa"] },
      ],
      [
        { role: "GK", category: "GK", acceptedPositions: ["GK", "Portero", "Goalkeeper"] },
      ],
    ],
  },
  "5-3-2": {
    name: "5-3-2",
    lines: [
      [
        { role: "LS", category: "ATT", acceptedPositions: ["ST", "CF", "Delantero", "Delantera"] },
        { role: "RS", category: "ATT", acceptedPositions: ["ST", "CF", "Delantero", "Delantera"] },
      ],
      [
        { role: "LCM", category: "MID", acceptedPositions: ["CM", "CAM", "Mediocentro"] },
        { role: "CDM", category: "MID", acceptedPositions: ["CDM", "CM", "Mediocentro Defensivo", "Pivote"] },
        { role: "RCM", category: "MID", acceptedPositions: ["CM", "CAM", "Mediocentro"] },
      ],
      [
        { role: "LWB", category: "DEF", acceptedPositions: ["LB", "LWB", "LM", "Lateral Izquierdo", "Carrilero Izquierdo"] },
        { role: "LCB", category: "DEF", acceptedPositions: ["CB", "LCB", "RCB", "Central", "Central Izquierdo", "Centrales", "Centre-Back", "Defensa"] },
        { role: "CB", category: "DEF", acceptedPositions: ["CB", "Central", "Central Izquierdo", "Central Derecho", "Centrales", "Centre-Back", "Defensa"] },
        { role: "RCB", category: "DEF", acceptedPositions: ["CB", "RCB", "LCB", "Central", "Central Derecho", "Centrales", "Centre-Back", "Defensa"] },
        { role: "RWB", category: "DEF", acceptedPositions: ["RB", "RWB", "RM", "Lateral Derecho", "Carrilero Derecho"] },
      ],
      [
        { role: "GK", category: "GK", acceptedPositions: ["GK", "Portero", "Goalkeeper"] },
      ],
    ],
  },
};

const METRIC_OPTIONS = [
  { id: "nota_global", name: "Nota Global (OVR General)" },
  { id: "nota_ataque", name: "Métrica: Ataque" },
  { id: "nota_construccion", name: "Métrica: Construcción" },
  { id: "nota_defensa", name: "Métrica: Defensa" },
  { id: "nota_balon_parado", name: "Métrica: Balón Parado" },
  { id: "nota_disponibilidad", name: "Métrica: Disponibilidad" },
  { id: "nota_fisico", name: "Métrica: Físico (EA Rating)" },
  { id: "minutes_played", name: "Minutos Jugados" },
];

function BuilderContent() {
  const [formation, setFormation] = useState<FormationKey>("4-3-3");
  const [metricSort, setMetricSort] = useState<string>("nota_global");
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [availableLeagues, setAvailableLeagues] = useState<{ id: string; name: string }[]>([]);
  const [availableTeams, setAvailableTeams] = useState<{ id: string; name: string }[]>([]);
  const [availableCountries, setAvailableCountries] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [minAge, setMinAge] = useState<number>(15);
  const [maxAge, setMaxAge] = useState<number>(42);
  const [minRating, setMinRating] = useState<number>(0);
  const [selectedPlayerModal, setSelectedPlayerModal] = useState<any | null>(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/players?season=all");
        const json = await res.json();
        const playersList = json.players || [];
        setAllPlayers(playersList);

        if (json.filters?.leaguesDetailed) {
          setAvailableLeagues(json.filters.leaguesDetailed.map((l: any) => ({ id: l.name, name: l.name })));
        }
        if (json.filters?.teamsDetailed) {
          setAvailableTeams(json.filters.teamsDetailed.map((t: any) => ({ id: t.name, name: t.name })));
        }

        // Countries from players
        const countries = Array.from(
          new Set(playersList.map((p: any) => p.country).filter(Boolean))
        ).sort();
        setAvailableCountries(countries.map((c) => ({ id: c as string, name: c as string })));
      } catch (err) {
        console.error("Failed to fetch players for 11 Builder", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter and sort candidates
  const filteredCandidates = useMemo(() => {
    const now = Date.now();

    return allPlayers.filter((p) => {
      // League filter
      if (selectedLeagues.length > 0) {
        const pLeague = (p.leagueName || "").toLowerCase();
        const match = selectedLeagues.some(
          (sel) => pLeague === sel.toLowerCase() || pLeague.includes(sel.toLowerCase())
        );
        if (!match) return false;
      }

      // Team filter
      if (selectedTeams.length > 0) {
        const pTeam = (p.teamName || "").toLowerCase();
        const match = selectedTeams.some(
          (sel) => pTeam === sel.toLowerCase() || pTeam.includes(sel.toLowerCase())
        );
        if (!match) return false;
      }

      // Country filter
      if (selectedCountries.length > 0) {
        if (!p.country || !selectedCountries.includes(p.country)) return false;
      }

      // Age filter
      if (p.birthDate) {
        const age = Math.floor((now - new Date(p.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000));
        if (age < minAge || age > maxAge) return false;
      }

      // Min Rating
      if (minRating > 0 && (p.notaGlobal || 0) < minRating) {
        return false;
      }

      return true;
    });
  }, [allPlayers, selectedLeagues, selectedTeams, selectedCountries, minAge, maxAge, minRating]);

  // Compute the Best 11 for the selected formation
  const bestEleven = useMemo(() => {
    const selectedPlayerIds = new Set<string>();
    const formationLines = FORMATION_CONFIGS[formation].lines;

    // Helper score getter
    const getScore = (p: any) => {
      if (metricSort === "nota_ataque") return p.notaAtaque ?? 0;
      if (metricSort === "nota_construccion") return p.notaConstruccion ?? 0;
      if (metricSort === "nota_defensa") return p.notaDefensa ?? 0;
      if (metricSort === "nota_balon_parado") return p.notaBalonParado ?? 0;
      if (metricSort === "nota_disponibilidad") return p.notaDisponibilidad ?? 0;
      if (metricSort === "nota_fisico") return p.notaFisico ?? 0;
      if (metricSort === "minutes_played") return p.minutesPlayed ?? 0;
      return p.notaGlobal ?? p.score_general ?? 0;
    };

    // Flatten all slots with line and slot indices
    const slotsWithPos: { lineIdx: number; slotIdx: number; slot: PositionSlot }[] = [];
    formationLines.forEach((line, lIdx) => {
      line.forEach((slot, sIdx) => {
        slotsWithPos.push({ lineIdx: lIdx, slotIdx: sIdx, slot });
      });
    });

    const resultSlots: { lineIdx: number; slotIdx: number; slot: PositionSlot; player: any | null }[] = [];

    slotsWithPos.forEach(({ lineIdx, slotIdx, slot }) => {
      // Find candidate matching accepted positions
      const candidates = filteredCandidates.filter((p) => {
        if (selectedPlayerIds.has(p.id)) return false;

        const pPos = (p.position || "").toUpperCase();
        const pDem = (p.grupoDemarcacion || "").toUpperCase();

        // Exact or partial match with accepted positions
        const matchesPosition = slot.acceptedPositions.some((pos) => {
          const upPos = pos.toUpperCase();
          return pPos.includes(upPos) || pDem.includes(upPos) || upPos.includes(pPos);
        });

        // Fallback by general category if specific match fails
        if (!matchesPosition) {
          if (slot.category === "GK" && (pPos.includes("GK") || pPos.includes("PORT") || pDem.includes("PORT"))) return true;
          if (slot.category === "DEF" && (pDem.includes("DEF") || pDem.includes("CENTRAL") || pDem.includes("LATERAL") || pPos.includes("CB") || pPos.includes("LB") || pPos.includes("RB") || pPos.includes("CENTRAL"))) return true;
          if (slot.category === "MID" && (pDem.includes("MED") || pDem.includes("MID") || pPos.includes("CM") || pPos.includes("CAM") || pPos.includes("CDM"))) return true;
          if (slot.category === "ATT" && (pDem.includes("DEL") || pDem.includes("ATT") || pPos.includes("ST") || pPos.includes("RW") || pPos.includes("LW") || pPos.includes("CF"))) return true;
        }

        return matchesPosition;
      });

      // Sort candidates by the selected metric score descending
      candidates.sort((a, b) => getScore(b) - getScore(a));

      const chosen = candidates[0] || null;
      if (chosen) {
        selectedPlayerIds.add(chosen.id);
      }

      resultSlots.push({ lineIdx, slotIdx, slot, player: chosen });
    });

    // Reconstruct lines
    const finalLines = formationLines.map((line, lIdx) => {
      return line.map((slot, sIdx) => {
        const found = resultSlots.find((r) => r.lineIdx === lIdx && r.slotIdx === sIdx);
        return {
          slot,
          player: found?.player || null,
        };
      });
    });

    return finalLines;
  }, [formation, filteredCandidates, metricSort]);

  // Average OVR of the 11
  const squadOvr = useMemo(() => {
    let sum = 0;
    let count = 0;
    bestEleven.forEach((line) => {
      line.forEach(({ player }) => {
        if (player) {
          sum += player.notaGlobal ?? player.score_general ?? 75;
          count++;
        }
      });
    });
    return count > 0 ? (sum / count).toFixed(1) : "—";
  }, [bestEleven]);

  return (
    <div className="min-h-screen bg-[#070b14] text-white p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                11 BUILDER <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">ELITE TACTICAL</span>
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5">
                Campograma táctico con las mejores jugadoras del mundo según tu sistema de juego y filtros aplicados.
              </p>
            </div>
          </div>
        </div>

        {/* Global Squad Stat Badge */}
        <div className="flex items-center gap-4 bg-navy-950/80 border border-white/10 rounded-xl p-3 shadow-lg">
          <div className="text-center px-3 border-r border-white/10">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Formación</span>
            <span className="text-lg font-black text-emerald-400">{formation}</span>
          </div>
          <div className="text-center px-3 border-r border-white/10">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Rating Medio</span>
            <span className="text-lg font-black text-amber-400">{squadOvr}</span>
          </div>
          <div className="text-center px-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Candidatas</span>
            <span className="text-lg font-black text-sky-400">{filteredCandidates.length}</span>
          </div>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-[#0b1322] border border-white/10 rounded-2xl p-4 md:p-5 mb-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
          <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
          <span>Filtros y Configuración del 11 Ideal</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Formation Picker */}
          <div>
            <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Sistema / Dibujo
            </label>
            <select
              value={formation}
              onChange={(e) => setFormation(e.target.value as FormationKey)}
              className="w-full h-9 px-3 rounded-lg border border-white/10 bg-navy-950/90 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
            >
              {(Object.keys(FORMATION_CONFIGS) as FormationKey[]).map((f) => (
                <option key={f} value={f} className="bg-[#0b1322] text-white">
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* Metric Sort */}
          <div>
            <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Métrica de Selección
            </label>
            <select
              value={metricSort}
              onChange={(e) => setMetricSort(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-white/10 bg-navy-950/90 text-xs text-emerald-400 focus:outline-none focus:border-emerald-500 font-semibold"
            >
              {METRIC_OPTIONS.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#0b1322] text-white">
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* League Filter */}
          <MultiSelectFilter
            label="Ligas"
            placeholder="Todas las ligas"
            options={availableLeagues}
            selectedIds={selectedLeagues}
            onChange={setSelectedLeagues}
          />

          {/* Team Filter */}
          <MultiSelectFilter
            label="Equipos"
            placeholder="Todos los equipos"
            options={availableTeams}
            selectedIds={selectedTeams}
            onChange={setSelectedTeams}
          />

          {/* Country / Nationality Filter */}
          <MultiSelectFilter
            label="Nacionalidad"
            placeholder="Todas las naciones"
            options={availableCountries}
            selectedIds={selectedCountries}
            onChange={setSelectedCountries}
          />

          {/* Min Rating Slider / Input */}
          <div>
            <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Nota Mínima: <span className="text-emerald-400 font-bold">{minRating > 0 ? minRating : "Sin mín."}</span>
            </label>
            <input
              type="range"
              min="0"
              max="90"
              step="5"
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="w-full h-2 bg-navy-950 rounded-lg appearance-none cursor-pointer accent-emerald-500 mt-2"
            />
          </div>
        </div>

        {/* Age Range Slider */}
        <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-medium">Rango de Edad:</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="15"
                max={maxAge}
                value={minAge}
                onChange={(e) => setMinAge(Number(e.target.value))}
                className="w-14 h-7 text-center rounded bg-navy-950 border border-white/10 text-xs text-white"
              />
              <span className="text-slate-500">—</span>
              <input
                type="number"
                min={minAge}
                max="45"
                value={maxAge}
                onChange={(e) => setMaxAge(Number(e.target.value))}
                className="w-14 h-7 text-center rounded bg-navy-950 border border-white/10 text-xs text-white"
              />
              <span className="text-slate-400 text-[11px]">años</span>
            </div>
          </div>

          {(selectedLeagues.length > 0 || selectedTeams.length > 0 || selectedCountries.length > 0 || minRating > 0 || minAge > 15 || maxAge < 42) && (
            <button
              onClick={() => {
                setSelectedLeagues([]);
                setSelectedTeams([]);
                setSelectedCountries([]);
                setMinRating(0);
                setMinAge(15);
                setMaxAge(42);
              }}
              className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 font-semibold"
            >
              <X className="w-3.5 h-3.5" />
              Resetear todos los filtros
            </button>
          )}
        </div>
      </div>

      {/* Main Tactical Pitch */}
      {isLoading ? (
        <div className="min-h-[500px] flex items-center justify-center">
          <LoadingState message="Calculando el 11 ideal y posicionando a las mejores jugadoras..." />
        </div>
      ) : (
        <StadiumPitch>
          {bestEleven.map((line, lineIndex) => (
            <div
              key={`line-${lineIndex}`}
              className="w-full flex items-center justify-around px-2 sm:px-6 my-2"
            >
              {line.map(({ slot, player }, slotIndex) => {
                if (!player) {
                  return (
                    <div
                      key={`empty-${lineIndex}-${slotIndex}`}
                      className="flex flex-col items-center justify-center w-24 h-36 rounded-xl border-2 border-dashed border-white/20 bg-black/40 backdrop-blur-sm p-2 text-center"
                    >
                      <span className="text-[11px] font-black text-amber-400 uppercase">{slot.role}</span>
                      <span className="text-[10px] text-slate-400 mt-2">Sin candidata con estos filtros</span>
                    </div>
                  );
                }

                return (
                  <PitchCard
                    key={player.id}
                    assignedRole={slot.role}
                    player={player}
                    onClick={() => setSelectedPlayerModal(player)}
                  />
                );
              })}
            </div>
          ))}
        </StadiumPitch>
      )}

      {/* Player Dossier Quick Modal when clicking any card on the pitch */}
      {selectedPlayerModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in-0 duration-150"
          onClick={() => setSelectedPlayerModal(null)}
        >
          <div
            className="relative w-full max-w-lg bg-[#0a1224] border border-white/20 rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row items-center gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedPlayerModal(null)}
              className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Complete Official Card */}
            <div className="shrink-0">
              <CromoJugador
                j={{
                  name: selectedPlayerModal.name,
                  photo_url: selectedPlayerModal.photoUrl,
                  country: selectedPlayerModal.country,
                  team_id: selectedPlayerModal.teamId,
                  team_name: selectedPlayerModal.teamName,
                  badge_url: selectedPlayerModal.badgeUrl,
                  league_name: selectedPlayerModal.leagueName,
                  league_logo_url: selectedPlayerModal.leagueLogoUrl,
                  demarcacion: selectedPlayerModal.position,
                  score_general: selectedPlayerModal.notaGlobal,
                  trend: selectedPlayerModal.trend,
                }}
                size="md"
              />
            </div>

            {/* Info details */}
            <div className="w-full flex-1 space-y-3">
              <div>
                <h3 className="text-xl font-black text-white">{selectedPlayerModal.name}</h3>
                <p className="text-xs text-slate-400">{selectedPlayerModal.teamName} • {selectedPlayerModal.leagueName}</p>
              </div>

              {/* Metric Breakdown */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-white/5 border border-white/5">
                  <span className="text-[10px] text-slate-400 block uppercase">Ataque</span>
                  <span className="text-base font-bold text-emerald-400">{selectedPlayerModal.notaAtaque?.toFixed(1) ?? "—"}</span>
                </div>
                <div className="p-2 rounded bg-white/5 border border-white/5">
                  <span className="text-[10px] text-slate-400 block uppercase">Construcción</span>
                  <span className="text-base font-bold text-sky-400">{selectedPlayerModal.notaConstruccion?.toFixed(1) ?? "—"}</span>
                </div>
                <div className="p-2 rounded bg-white/5 border border-white/5">
                  <span className="text-[10px] text-slate-400 block uppercase">Defensa</span>
                  <span className="text-base font-bold text-indigo-400">{selectedPlayerModal.notaDefensa?.toFixed(1) ?? "—"}</span>
                </div>
                <div className="p-2 rounded bg-white/5 border border-white/5">
                  <span className="text-[10px] text-slate-400 block uppercase">Físico EA</span>
                  <span className="text-base font-bold text-amber-400">{selectedPlayerModal.notaFisico ?? "—"}</span>
                </div>
              </div>

              <Link
                href={`/players/${selectedPlayerModal.id}`}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs transition-colors shadow-lg shadow-emerald-500/20"
              >
                <Eye className="w-4 h-4" />
                <span>Ver Expediente Completo de Scouting</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BuilderPage() {
  return (
    <Suspense fallback={<LoadingState message="Cargando 11 Builder..." />}>
      <BuilderContent />
    </Suspense>
  );
}

