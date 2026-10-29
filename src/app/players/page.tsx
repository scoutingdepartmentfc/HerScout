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
}

export default function PlayersDirectoryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savedWatchlist, setSavedWatchlist] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function fetchPlayers() {
      setIsLoading(true);
      try {
        const url = `/api/players?search=${encodeURIComponent(searchTerm)}`;
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
  }, [searchTerm]);

  const toggleWatchlist = (id: string) => {
    setSavedWatchlist((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filtered = players.filter((p) => {
    if (positionFilter === "all") return true;
    return p.position.toLowerCase().includes(positionFilter.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white">Player Database</h1>
            <Badge variant="default" size="sm">Opta Verified</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Searchable registry of professional women&apos;s football profiles connected to live Supabase database.
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Input
                placeholder="Search by player name... (e.g. Guijarro, Santana, Lejeune)"
                leftIcon={<Search className="w-3.5 h-3.5" />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
              >
                <option value="all">All Tactical Positions</option>
                <option value="Portero">Goalkeepers (POR / GK)</option>
                <option value="Central">Center Backs (CB)</option>
                <option value="Lateral">Full Backs (RB / LB)</option>
                <option value="Mediocentro">Midfielders (CM / CDM)</option>
                <option value="Mediapunta">Attacking Midfielders (AMF)</option>
                <option value="Delantero">Forwards / Wingers (DEL / W)</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <CardTitle>Player Registry Results</CardTitle>
            <Badge variant="secondary" size="sm">
              {filtered.length} profiles
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground hidden sm:block">
            Database: 988 verified records
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState message="Querying player database..." />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No players found"
              description="Try adjusting your search criteria or filter."
              actionLabel="Clear Search"
              onAction={() => {
                setSearchTerm("");
                setPositionFilter("all");
              }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player Card & Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Club & Badge</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell>
                      <Link href={`/players/${player.id}`} className="flex items-center gap-3 group">
                        {/* Player headshot / silhouette */}
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
                          <div className="font-semibold text-white group-hover:text-primary transition-colors">
                            {player.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            ID: {player.id.slice(0, 8)}...
                          </div>
                        </div>
                      </Link>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" size="sm">
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
                        <span className="text-white">{player.teamName}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Bandera country={player.country} size="xs" />
                        <span className="text-muted-foreground">{player.country || "—"}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant={savedWatchlist[player.id] ? "pitch" : "outline"}
                          size="xs"
                          onClick={() => toggleWatchlist(player.id)}
                          leftIcon={
                            savedWatchlist[player.id] ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Bookmark className="w-3 h-3" />
                            )
                          }
                        >
                          {savedWatchlist[player.id] ? "Saved" : "Track"}
                        </Button>
                        <Link href={`/players/${player.id}`}>
                          <Button size="xs" variant="secondary" leftIcon={<Eye className="w-3 h-3" />}>
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
