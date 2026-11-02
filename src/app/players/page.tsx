"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import { EmptyState, LoadingState } from "@/components/ui/StatusStates";
import { EscudoEquipo } from "@/components/scouting/EscudoEquipo";
import { Bandera } from "@/components/scouting/Bandera";
import { Search, Filter, Bookmark, ArrowUpRight, Download, Check, Eye } from "lucide-react";
import { notaClases } from "@/lib/notaColor";

interface PlayerRow {
  id: string;
  name: string;
  country?: string;
  photoUrl?: string;
  position: string;
  grupoDemarcacion: string;
  height?: number;
  weight?: number;
  teamId?: string;
  teamName: string;
  badgeUrl?: string;
  leagueName?: string;
  leagueLogoUrl?: string;
  minutesPlayed?: number;
  matchesPlayed?: number;
  notaGlobal?: number | null;
  notaAtaque?: number | null;
  notaConstruccion?: number | null;
  notaDefensa?: number | null;
  notaBalonParado?: number | null;
  notaDisponibilidad?: number | null;
  notaFisico?: number | null;
}

export default function PlayersDirectoryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [sortBy, setSortBy] = useState<string>("nota_global");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savedWatchlist, setSavedWatchlist] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function fetchPlayers() {
      setIsLoading(true);
      try {
        const url = `/api/players?search=${encodeURIComponent(searchTerm)}&sortBy=${sortBy}&order=${sortOrder}&position=${positionFilter}`;
        const res = await fetch(url);
        const json = await res.json();
        setPlayers(json.players || []);
      } catch (err) {
        console.error("Failed to fetch players:", err);
      } finally {
        setIsLoading(false);
      }
    }

    const timer = setTimeout(() => {
      fetchPlayers();
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm, sortBy, sortOrder, positionFilter]);

  const toggleWatchlist = (id: string) => {
    setSavedWatchlist((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSort = (colKey: string) => {
    if (sortBy === colKey) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(colKey);
      setSortOrder("desc");
    }
  };

  const getScoreBadge = (score: number | null | undefined, isGeneral: boolean = false) => {
    if (score === null || score === undefined) {
      return <span className="text-muted-foreground/40 font-mono text-xs">—</span>;
    }
    const val = Math.round(score);
    // >= 70 green, 50-70 orange, < 50 red (ratings relative to the league average)
    const colorClass = `${notaClases(val).badge} ${isGeneral ? "font-black" : "font-bold"}`;

    return (
      <span className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-md text-xs border tabular-nums font-mono ${colorClass}`}>
        {val}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-white">Player Database</h1>
            <Badge variant="default" size="sm" className="bg-primary/20 text-sky-300 border-primary/40">Opta & Liga F Verified</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Searchable registry of professional women's football profiles ranked by advanced performance ratings.
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <Card className="bg-[#070c18] border-border/80 shadow-xl">
        <CardContent className="p-3.5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Input
                placeholder="Search player by name... (e.g. Bonmatí, Eizagirre, Benítez, Ouzraoui)"
                leftIcon={<Search className="w-4 h-4 text-muted-foreground" />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-navy-950"
              />
            </div>
            <div>
              <Select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="bg-navy-950"
              >
                <option value="all">All Tactical Positions</option>
                <option value="Portero">Goalkeepers (GK)</option>
                <option value="Central">Center-backs (CB)</option>
                <option value="Lateral">Full-backs (RB / LB)</option>
                <option value="Mediocentro">Midfielders (CM / CDM)</option>
                <option value="Mediapunta">Attacking Midfielders (CAM / AMF)</option>
                <option value="Extremo">Wingers (RW / LW)</option>
                <option value="Delantero">Forwards (ST / CF)</option>
              </Select>
            </div>
          </div>

          {/* Quick Score Ordering Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40 text-xs">
            <span className="text-[11px] font-semibold text-muted-foreground mr-1">Sort by rating:</span>
            {[
              { id: "nota_global", label: "Overall (OVR)" },
              { id: "nota_ataque", label: "Attacking" },
              { id: "nota_construccion", label: "Build-up" },
              { id: "nota_defensa", label: "Defending" },
              { id: "nota_balon_parado", label: "Set Pieces" },
              { id: "nota_disponibilidad", label: "Availability" },
              { id: "nota_fisico", label: "Physical" },
            ].map((col) => {
              const active = sortBy === col.id;
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => handleSort(col.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors border ${
                    active
                      ? "bg-primary text-white border-primary font-semibold shadow-sm"
                      : "bg-navy-950 border-border/60 text-muted-foreground hover:text-white hover:border-border"
                  }`}
                >
                  <span>{col.label}</span>
                  {active && <span className="text-[10px]">{sortOrder === "desc" ? "↓" : "↑"}</span>}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card className="bg-[#070c18] border-border/80 shadow-2xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between py-3.5 px-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-bold text-white">Player Registry Results</CardTitle>
            <Badge variant="secondary" size="sm">
              {players.length} profiles
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Normalized 0–100 Rating vs. League Average
          </span>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <LoadingState message="Loading player database and metrics..." />
          ) : players.length === 0 ? (
            <EmptyState
              title="No players found"
              description="Try adjusting your search criteria or position filter."
              actionLabel="Clear search"
              onAction={() => {
                setSearchTerm("");
                setPositionFilter("all");
                setSortBy("nota_global");
              }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 bg-navy-950/60 text-xs">
                  <TableHead className="font-semibold text-white">Player</TableHead>
                  <TableHead className="font-semibold text-white">Position</TableHead>
                  <TableHead className="font-semibold text-white">Club</TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_global")}
                    className="cursor-pointer text-center font-bold text-amber-300 hover:text-amber-200 select-none"
                    title="Click to sort by Overall OVR"
                  >
                    OVR {sortBy === "nota_global" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_ataque")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none"
                    title="Click to sort by Attacking"
                  >
                    ATT {sortBy === "nota_ataque" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_construccion")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none"
                    title="Click to sort by Build-up"
                  >
                    CRE {sortBy === "nota_construccion" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_defensa")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none"
                    title="Click to sort by Defending"
                  >
                    DEF {sortBy === "nota_defensa" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_balon_parado")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none"
                    title="Click to sort by Set Pieces"
                  >
                    SET {sortBy === "nota_balon_parado" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_disponibilidad")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none"
                    title="Click to sort by Availability"
                  >
                    AVAIL {sortBy === "nota_disponibilidad" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort("nota_fisico")}
                    className="cursor-pointer text-center font-semibold text-slate-300 hover:text-white select-none"
                    title="Click to sort by Physical Rating"
                  >
                    PHY {sortBy === "nota_fisico" && (sortOrder === "desc" ? "↓" : "↑")}
                  </TableHead>
                  <TableHead className="text-right font-semibold text-white">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/30">
                {players.map((player) => (
                  <TableRow key={player.id} className="hover:bg-navy-900/50 transition-colors">
                    <TableCell>
                      <Link href={`/players/${player.id}`} className="flex items-center gap-3 group">
                        <div className="w-9 h-9 rounded-full bg-navy-900 border border-white/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:border-primary transition-colors">
                          {player.photoUrl ? (
                            <img
                              src={player.photoUrl}
                              alt={player.name}
                              className="w-full h-full object-cover object-top"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <span className="text-xs font-bold text-muted-foreground">⚽</span>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-white group-hover:text-primary transition-colors leading-tight">
                            {player.name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Bandera country={player.country} size="xs" />
                            <span className="text-[10px] text-muted-foreground">{player.country || "—"}</span>
                          </div>
                        </div>
                      </Link>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" size="sm" className="font-medium text-slate-300">
                        {player.position}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <EscudoEquipo
                          teamId={player.teamId}
                          badgeUrl={player.badgeUrl}
                          name={player.teamName}
                          size={18}
                        />
                        <div className="min-w-0">
                          <div className="text-xs text-white font-medium">{player.teamName}</div>
                          {player.leagueName && (
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                              {player.leagueLogoUrl && (
                                <img
                                  src={player.leagueLogoUrl}
                                  alt=""
                                  className="h-3.5 w-auto max-w-[14px] object-contain bg-transparent shrink-0"
                                  loading="lazy"
                                />
                              )}
                              <span className="truncate">{player.leagueName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Scoring Columns */}
                    <TableCell className="text-center font-bold">
                      {getScoreBadge(player.notaGlobal, true)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getScoreBadge(player.notaAtaque)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getScoreBadge(player.notaConstruccion)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getScoreBadge(player.notaDefensa)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getScoreBadge(player.notaBalonParado)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getScoreBadge(player.notaDisponibilidad)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getScoreBadge(player.notaFisico)}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant={savedWatchlist[player.id] ? "pitch" : "ghost"}
                          size="xs"
                          onClick={() => toggleWatchlist(player.id)}
                          leftIcon={
                            savedWatchlist[player.id] ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Bookmark className="w-3 h-3" />
                            )
                          }
                          className="h-7 px-2"
                        >
                          {savedWatchlist[player.id] ? "Saved" : "Track"}
                        </Button>
                        <Link href={`/players/${player.id}`}>
                          <Button size="xs" variant="secondary" leftIcon={<Eye className="w-3 h-3" />} className="h-7 px-2.5">
                            Profile
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
