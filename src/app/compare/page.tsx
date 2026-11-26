"use client";

import React, { useEffect, useState, useMemo } from "react";
import { RadarChart, RadarAxis, RadarDataset } from "@/components/compare/RadarChart";
import { PlayerSelectorSlot, ComparePlayerItem } from "@/components/compare/PlayerSelectorSlot";
import { PlayerSearchModal } from "@/components/compare/PlayerSearchModal";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  METRICS_HIERARCHY,
  GOALKEEPER_HIERARCHY,
  CategoryDef,
  MetricDef,
} from "@/lib/metricsHierarchy";
import {
  Users,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  Layers,
  ChevronDown,
  Check,
  Trophy,
  ArrowRight,
  TrendingUp,
  Download,
} from "lucide-react";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { notaClases } from "@/lib/notaColor";

// Color palette for compared players (modern glowing colors)
const PLAYER_COLORS = [
  "#10b981", // Emerald Neon
  "#38bdf8", // Sky Cyan
  "#f59e0b", // Warm Amber
  "#ec4899", // Vivid Pink
  "#a855f7", // Electric Violet
];

// Quick presets for fast radar configuration
const PRESETS: { id: string; label: string; metrics: string[] }[] = [
  {
    id: "categories",
    label: "Main Categories OVR",
    metrics: ["_cat_ataque", "_cat_construccion", "_cat_defensa", "_cat_balon_parado", "_cat_disponibilidad"],
  },
  {
    id: "attacking_mid",
    label: "Creative / Attacking Mids",
    metrics: [
      "of_asistencias_p90",
      "of_xA_p90",
      "of_pase_filtrado_avanzado_p90",
      "of_pases_dentro_area_p90",
      "of_progresivos_p90",
      "of_regates_z4_p90",
      "of_tiros_p90",
      "of_xG_p90",
    ],
  },
  {
    id: "strikers",
    label: "Strikers & Finishers",
    metrics: [
      "of_goles_p90",
      "of_xG_p90",
      "of_tiros_p90",
      "of_tiros_dentro_pct",
      "of_grandes_ocasiones_p90",
      "of_1vs1_portero_p90",
      "of_remates_primeras_p90",
      "of_asistencias_p90",
    ],
  },
  {
    id: "wingers",
    label: "Wingers & 1v1 Threat",
    metrics: [
      "of_regates_p90",
      "of_regates_pct",
      "of_centros_buenos_p90",
      "of_centros_buenos_pct",
      "of_pases_dentro_area_p90",
      "of_conduccion_pase_p90",
      "of_aparecer_campo_rival_p90",
      "of_tiros_p90",
    ],
  },
  {
    id: "midfield_engine",
    label: "Box-to-Box & Playmakers",
    metrics: [
      "of_pases_buenos_p90",
      "of_pases_pct",
      "of_progresivos_p90",
      "of_cambios_ori_p90",
      "def_recuperaciones_p90",
      "def_intercepciones_p90",
      "def_duelos_suelo_pct",
      "of_participacion_pct",
    ],
  },
  {
    id: "defenders",
    label: "Defenders & Full-Backs",
    metrics: [
      "def_entradas_p90",
      "def_entradas_pct",
      "def_intercepciones_p90",
      "def_recuperaciones_p90",
      "def_aereos_ganados_pct",
      "def_despejes_propio_p90",
      "of_pases_buenos_p90",
      "of_progresivos_p90",
    ],
  },
];

export default function PlayerComparisonPage() {
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

  // Selected players (up to 4)
  const [selectedPlayers, setSelectedPlayers] = useState<ComparePlayerItem[]>([]);
  const [activeSlotModal, setActiveSlotModal] = useState<number | null>(null);

  // Full detailed data cache for selected players (fetched from /api/players/[id])
  const [playerProfiles, setPlayerProfiles] = useState<Record<string, any>>({});
  const [loadingProfileId, setLoadingProfileId] = useState<string | null>(null);

  // Selected metric keys for the radar
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<string[]>(PRESETS[0].metrics);
  const [activePreset, setActivePreset] = useState<string>(PRESETS[0].id);

  // Hovered / highlighted dataset
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<string | null>(null);

  // Metric selector expansion panel state
  const [isMetricPanelOpen, setIsMetricPanelOpen] = useState(false);
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>("ataque");

  // 1. Fetch player catalog for the search modal
  useEffect(() => {
    async function fetchPlayers() {
      try {
        const res = await fetch("/api/players?season=all");
        if (res.ok) {
          const json = await res.json();
          const list = json.data || json.players || [];
          setAllPlayers(list);

          const urlIds = typeof window !== "undefined"
            ? (new URLSearchParams(window.location.search).get("players") || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [];

          const toCompareItem = (raw: any, color: string): ComparePlayerItem => ({
            id: raw.id,
            name: raw.name,
            matchName: raw.matchName,
            photoUrl: raw.photoUrl,
            position: raw.position,
            teamName: raw.teamName,
            badgeUrl: raw.badgeUrl,
            leagueName: raw.leagueName,
            leagueLogoUrl: raw.leagueLogoUrl,
            color,
            rating: raw.notaGlobal,
            age: raw.birthDate
              ? Math.floor((Date.now() - new Date(raw.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))
              : null,
            minutesPlayed: raw.minutesPlayed,
          });

          if (urlIds.length > 0 && selectedPlayers.length === 0) {
            const matched = urlIds
              .map((id, idx) => {
                const found = list.find((p: any) => p.id === id);
                return found ? toCompareItem(found, PLAYER_COLORS[idx % PLAYER_COLORS.length]) : null;
              })
              .filter((x): x is ComparePlayerItem => x !== null);
            if (matched.length > 0) {
              setSelectedPlayers(matched);
              return;
            }
          }

          // Auto-select first two top players if none selected
          if (list.length >= 2 && selectedPlayers.length === 0) {
            setSelectedPlayers([
              toCompareItem(list[0], PLAYER_COLORS[0]),
              toCompareItem(list[1], PLAYER_COLORS[1]),
            ]);
          }
        }
      } catch (err) {
        console.error("Failed to load catalog for comparison", err);
      } finally {
        setIsLoadingCatalog(false);
      }
    }
    fetchPlayers();
  }, []);

  // 2. Fetch detailed profile metrics for every selected player
  useEffect(() => {
    selectedPlayers.forEach((sp) => {
      if (!playerProfiles[sp.id]) {
        fetchPlayerProfile(sp.id);
      }
    });
  }, [selectedPlayers]);

  const fetchPlayerProfile = async (id: string) => {
    try {
      setLoadingProfileId(id);
      const res = await fetch(`/api/players/${id}`);
      if (res.ok) {
        const json = await res.json();
        setPlayerProfiles((prev) => ({ ...prev, [id]: json }));
      }
    } catch (err) {
      console.error(`Error loading profile ${id}`, err);
    } finally {
      setLoadingProfileId(null);
    }
  };

  // Helper to add player
  const handleSelectPlayer = (raw: any, slotIdx: number) => {
    const age = raw.birthDate || raw.birth_date
      ? Math.floor(
          (Date.now() - new Date(raw.birthDate || raw.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000)
        )
      : null;

    setSelectedPlayers((prev) => {
      const copy = [...prev];
      const newItem: ComparePlayerItem = {
        id: raw.id,
        name: raw.name,
        matchName: raw.matchName || raw.match_name,
        photoUrl: raw.photoUrl || raw.photo_url,
        position: raw.position || raw.primary_position,
        teamName: raw.teamName || raw.teams?.name,
        badgeUrl: raw.badgeUrl || raw.teams?.badge_url,
        leagueName: raw.leagueName || raw.teams?.league_name,
        leagueLogoUrl: raw.leagueLogoUrl || raw.teams?.league_logo_url,
        color: PLAYER_COLORS[0], // Will be assigned by index in computed players
        rating: raw.notaGlobal ?? raw.rating ?? null,
        age,
        minutesPlayed: raw.minutesPlayed ?? raw.minutes_played,
      };

      if (slotIdx < copy.length) {
        copy[slotIdx] = newItem;
      } else {
        copy.push(newItem);
      }

      // Re-assign distinct colors by current index so no two players ever collide
      return copy.map((p, idx) => ({
        ...p,
        color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
      }));
    });
  };

  const handleRemovePlayer = (slotIdx: number) => {
    setSelectedPlayers((prev) =>
      prev
        .filter((_, idx) => idx !== slotIdx)
        .map((p, idx) => ({
          ...p,
          color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
        }))
    );
  };

  // Build dictionary of metric definitions across hierarchies
  const allMetricDefs = useMemo(() => {
    const map = new Map<string, { key: string; name: string; category: string }>();

    // Category scores
    map.set("_cat_ataque", { key: "_cat_ataque", name: "Attack OVR", category: "Categories" });
    map.set("_cat_construccion", { key: "_cat_construccion", name: "Build-Up OVR", category: "Categories" });
    map.set("_cat_defensa", { key: "_cat_defensa", name: "Defense OVR", category: "Categories" });
    map.set("_cat_balon_parado", { key: "_cat_balon_parado", name: "Set Pieces OVR", category: "Categories" });
    map.set("_cat_disponibilidad", { key: "_cat_disponibilidad", name: "Availability OVR", category: "Categories" });

    // Fallbacks from ETIQUETAS for legacy/shorthand metric keys
    const fallbackNames: Record<string, string> = {
      def_entradas_ok_p90: "Tackles won",
      def_entradas_p90: "Tackles won",
      def_entradas_pct: "Tackle success %",
      def_intercepciones_p90: "Interceptions",
      def_recuperaciones_p90: "Recoveries",
      def_despejes_p90: "Clearances",
      def_despejes_propio_p90: "Clearances (own half)",
      def_aereos_pct: "Aerial duels won %",
      def_aereos_ganados_pct: "Aerial duels won %",
      def_aereos_ganados_p90: "Aerial duels won",
      def_duelos_suelo_pct: "Ground duels won %",
      of_pases_buenos_p90: "Accurate passes",
      of_pases_pct: "Pass accuracy %",
      of_progresivos_p90: "Progressive passes",
      of_progresivos_pct: "Progressive pass %",
      of_goles_p90: "Goals",
      of_xG_p90: "xG (expected goals)",
      of_tiros_p90: "Total shots",
      of_tiros_dentro_pct: "Shots on target %",
      of_asistencias_p90: "Key passes",
      of_asistencia_gol_p90: "Goal assists",
      of_xA_p90: "xA (expected assists)",
      of_regates_p90: "Dribbles completed",
      of_regates_pct: "Dribble success %",
      of_centros_buenos_p90: "Completed crosses",
      of_centros_pct: "Cross accuracy %",
      of_centros_buenos_pct: "Cross accuracy %",
    };
    for (const [k, name] of Object.entries(fallbackNames)) {
      map.set(k, { key: k, name, category: "Core" });
    }

    METRICS_HIERARCHY.forEach((cat) => {
      cat.subcategories.forEach((sub) => {
        sub.metrics.forEach((m) => {
          map.set(m.key, { key: m.key, name: m.name, category: cat.name });
        });
      });
    });

    GOALKEEPER_HIERARCHY.forEach((cat) => {
      cat.subcategories.forEach((sub) => {
        sub.metrics.forEach((m) => {
          if (!map.has(m.key)) {
            map.set(m.key, { key: m.key, name: m.name, category: `GK · ${cat.name}` });
          }
        });
      });
    });

    return map;
  }, []);

  // Compute Radar Axes
  const radarAxes: RadarAxis[] = useMemo(() => {
    return selectedMetricKeys.map((k) => {
      const def = allMetricDefs.get(k);
      return {
        key: k,
        label: def ? def.name : k,
        category: def?.category,
      };
    });
  }, [selectedMetricKeys, allMetricDefs]);

  // Extract score (0-100) for a given player and metric key
  const getPlayerMetricScore = (playerId: string, metricKey: string): number => {
    const prof = playerProfiles[playerId];
    if (!prof) return 0;

    // 1. Try from allSeasons aggregated or primary selected stats
    const statsObj = prof.allSeasons || (prof.seasonStats && prof.seasonStats[0]);
    const metricasMap = statsObj?.radar_data?.metricas || {};

    // Check category level
    if (metricKey.startsWith("_cat_")) {
      const catFieldMap: Record<string, string> = {
        _cat_ataque: "nota_ataque",
        _cat_construccion: "nota_construccion",
        _cat_defensa: "nota_defensa",
        _cat_balon_parado: "nota_balon_parado",
        _cat_disponibilidad: "nota_disponibilidad",
      };
      const noteField = catFieldMap[metricKey];
      if (noteField && statsObj?.[noteField] != null) {
        return Math.min(100, Math.max(0, Number(statsObj[noteField])));
      }
    }

    // Check direct metric entry [val, note0_10]
    const pair = metricasMap[metricKey];
    if (pair && Array.isArray(pair)) {
      // Second element is 0-10, scale to 0-100; or if already 0-100
      const note = Number(pair[1]);
      if (!isNaN(note)) {
        return Math.min(100, Math.max(0, note <= 10 ? note * 10 : note));
      }
    }

    return 50; // Fallback neutral average if metric not present
  };

  // Compute Radar Datasets
  const radarDatasets: RadarDataset[] = useMemo(() => {
    return selectedPlayers.map((p) => {
      const scores = selectedMetricKeys.map((k) => getPlayerMetricScore(p.id, k));
      return {
        id: p.id,
        label: p.matchName || p.name,
        color: p.color,
        data: scores,
        avatar: p.photoUrl,
        teamBadge: p.badgeUrl,
        teamName: p.teamName,
        position: p.position,
      };
    });
  }, [selectedPlayers, selectedMetricKeys, playerProfiles]);

  const toggleMetric = (key: string) => {
    setActivePreset("custom");
    setSelectedMetricKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 3) return prev; // Keep at least 3 metrics
        return prev.filter((k) => k !== key);
      } else {
        if (prev.length >= 12) return prev; // Max 12 metrics for clarity
        return [...prev, key];
      }
    });
  };

  const applyPreset = (presetId: string) => {
    const found = PRESETS.find((p) => p.id === presetId);
    if (found) {
      setActivePreset(presetId);
      setSelectedMetricKeys(found.metrics);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-primary/20 to-emerald-500/20 border border-primary/30 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Player Comparison
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Multi-player radar visualization across calibrated Opta performance metrics
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsMetricPanelOpen(!isMetricPanelOpen)}
            leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            className={isMetricPanelOpen ? "border-primary text-primary" : ""}
          >
            Customize Metrics ({selectedMetricKeys.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset("categories")}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Reset
          </Button>
        </div>
      </div>

      {/* Slots Row: 2 to 4 Players */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((idx) => {
          const player = selectedPlayers[idx] || null;
          return (
            <PlayerSelectorSlot
              key={`slot-${idx}`}
              slotIndex={idx}
              player={player}
              color={PLAYER_COLORS[idx % PLAYER_COLORS.length]}
              onOpenSearch={() => setActiveSlotModal(idx)}
              onRemove={() => handleRemovePlayer(idx)}
            />
          );
        })}
      </div>

      {/* Metric Customization Drawer / Accordion */}
      {isMetricPanelOpen && (
        <Card className="bg-[#070e1e] border-border/70 shadow-2xl animate-in slide-in-from-top-3 duration-200">
          <CardHeader className="py-3 px-5 border-b border-border/40 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                Select Radar Metrics ({selectedMetricKeys.length}/12)
              </CardTitle>
              <CardDescription className="text-xs">
                Pick 3 to 12 metrics to customize the radar polygon
              </CardDescription>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsMetricPanelOpen(false)}
            >
              Done
            </Button>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {/* Category tabs */}
            <div className="flex flex-wrap gap-1.5 border-b border-white/10 pb-3">
              {METRICS_HIERARCHY.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryTab(cat.id)}
                  style={{
                    borderColor: selectedCategoryTab === cat.id ? cat.color : "transparent",
                    color: selectedCategoryTab === cat.id ? "#ffffff" : "#94a3b8",
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                    selectedCategoryTab === cat.id ? "bg-white/10" : "hover:text-white"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Metrics pills for active category */}
            {(() => {
              const activeCat = METRICS_HIERARCHY.find((c) => c.id === selectedCategoryTab);
              if (!activeCat) return null;

              return (
                <div className="space-y-3">
                  {activeCat.subcategories.map((sub) => (
                    <div key={sub.id} className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        {sub.name}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {sub.metrics.map((m) => {
                          const isSelected = selectedMetricKeys.includes(m.key);
                          return (
                            <button
                              key={m.key}
                              type="button"
                              onClick={() => toggleMetric(m.key)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${
                                isSelected
                                  ? "bg-primary/25 border-primary text-white shadow-sm font-semibold"
                                  : "bg-navy-950/70 border-white/10 text-slate-400 hover:text-white hover:border-white/20"
                              }`}
                            >
                              <span>{m.name}</span>
                              {isSelected && <Check className="w-3 h-3 text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Main Comparison Section: Sidebar Presets + Radar Polygon + Comparative Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Preset Templates */}
        <div className="lg:col-span-2">
          <Card className="bg-[#070e1e]/90 border-border/60 shadow-xl overflow-hidden backdrop-blur-md">
            <CardHeader className="py-3 px-4 border-b border-border/40">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                <Layers className="w-3.5 h-3.5 text-primary" />
                Presets
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">Quick radar profiles</p>
            </CardHeader>
            <CardContent className="p-2 space-y-1">
              {PRESETS.map((pst) => (
                <button
                  key={pst.id}
                  type="button"
                  onClick={() => applyPreset(pst.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-between border ${
                    activePreset === pst.id
                      ? "bg-primary/20 text-primary border-primary/50 shadow-sm font-semibold"
                      : "bg-navy-950/40 text-slate-300 border-transparent hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <span className="truncate">{pst.label}</span>
                  {activePreset === pst.id && <Check className="w-3.5 h-3.5 shrink-0 text-primary" />}
                </button>
              ))}

              <div className="pt-2 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => setIsMetricPanelOpen(!isMetricPanelOpen)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 border ${
                    isMetricPanelOpen
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : "bg-white/[0.02] text-slate-400 border-white/10 hover:text-white hover:bg-white/[0.05]"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Customize ({selectedMetricKeys.length})</span>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Center: Interactive Radar Chart Card */}
        <Card className="lg:col-span-6 bg-[#070e1e]/90 border-border/60 shadow-2xl overflow-hidden backdrop-blur-md">
          <CardHeader className="py-3 px-5 border-b border-border/40 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                Multi-Player Radar Chart
              </CardTitle>
            </div>
            {/* Legend pills with interactive highlighting */}
            <div className="flex flex-wrap items-center gap-2">
              {selectedPlayers.map((p) => {
                const isHovered = highlightedPlayerId === p.id;
                return (
                  <button
                    key={`legend-${p.id}`}
                    type="button"
                    onMouseEnter={() => setHighlightedPlayerId(p.id)}
                    onMouseLeave={() => setHighlightedPlayerId(null)}
                    style={{
                      borderColor: isHovered ? p.color : `${p.color}40`,
                      backgroundColor: isHovered ? `${p.color}20` : "transparent",
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold text-white transition-all"
                  >
                    <span
                      style={{ backgroundColor: p.color }}
                      className="w-2 h-2 rounded-full inline-block"
                    />
                    <span>{p.matchName || p.name}</span>
                  </button>
                );
              })}
            </div>
          </CardHeader>
          <CardContent className="p-1 sm:p-2 pt-0 flex items-center justify-center min-h-[560px]">
            {selectedPlayers.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs">
                Select at least one player to generate the radar chart.
              </div>
            ) : (
              <RadarChart
                axes={radarAxes}
                datasets={radarDatasets}
                highlightedDatasetId={highlightedPlayerId}
                onHoverDataset={setHighlightedPlayerId}
                size={740}
              />
            )}
          </CardContent>
        </Card>

        {/* Right: Head-to-Head Detailed Metrics Table */}
        <Card className="lg:col-span-4 bg-[#070e1e]/90 border-border/60 shadow-2xl overflow-hidden backdrop-blur-md">
          <CardHeader className="py-3 px-5 border-b border-border/40">
            <CardTitle className="text-sm font-bold text-white">
              Head-to-Head Metric Scores
            </CardTitle>
            <CardDescription className="text-xs">
              Calibrated ratings 0–100 (league & position benchmarked)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#0b1329] text-slate-400 border-b border-border/40">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Metric</th>
                    {selectedPlayers.map((p) => (
                      <th
                        key={`th-${p.id}`}
                        style={{ color: p.color }}
                        className="py-2.5 px-3 text-right font-bold truncate max-w-[90px]"
                      >
                        {p.matchName || p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {selectedMetricKeys.map((k) => {
                    const def = allMetricDefs.get(k);
                    const scores = selectedPlayers.map((p) => getPlayerMetricScore(p.id, k));
                    const maxScore = Math.max(...scores, 0);

                    return (
                      <tr key={`tr-${k}`} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-4 text-white font-medium max-w-[170px] truncate" title={def?.name || k}>
                          {def?.name || k}
                        </td>
                        {selectedPlayers.map((p, idx) => {
                          const val = scores[idx];
                          const isBest = scores.length > 1 && val === maxScore && val > 0;
                          const colorObj = notaClases(Math.round(val));

                          return (
                            <td key={`td-${p.id}-${k}`} className="py-2.5 px-3 text-right">
                              <span
                                className={`inline-block font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                  isBest
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                                    : "text-slate-300"
                                }`}
                              >
                                {val.toFixed(1)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal for selecting player in slot */}
      {activeSlotModal != null && (
        <PlayerSearchModal
          isOpen={true}
          onClose={() => setActiveSlotModal(null)}
          onSelectPlayer={(raw) => handleSelectPlayer(raw, activeSlotModal)}
          allPlayers={allPlayers}
          alreadySelectedIds={selectedPlayers.map((p) => p.id)}
        />
      )}
    </div>
  );
}

