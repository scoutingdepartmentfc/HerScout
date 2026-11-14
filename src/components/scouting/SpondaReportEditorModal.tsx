"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  SPONDA_ROLES,
  SPONDA_REPUTATION,
  SPONDA_DEVELOPMENT_POTENTIAL,
  SPONDA_SCOUTING_STATUS,
  SPONDA_TYPE_OF_PLAYER,
  SPONDA_POSITIONAL_PROFILES,
  SPONDA_TEC_TAC_TAGS,
  SPONDA_DEBILITIES,
  SPONDA_TRANSFER_RISK,
  SPONDA_SCOUT_DECISION,
  SPONDA_SPECIALITIES,
  SPONDA_CLUBS_STATUS,
  SPONDA_POSITIONS,
  SpondaReportData,
} from "@/lib/spondaReportOptions";
import {
  Star,
  Search,
  Plus,
  Check,
  Calendar,
  User,
  Shield,
  Video,
  Sparkles,
  FileText,
  AlertCircle,
  HelpCircle,
  UserCheck,
  UserPlus,
} from "lucide-react";

interface SpondaReportEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (reportPayload: any) => Promise<void>;
  onChangePlayer?: () => void;
  allPlayers?: any[];
  initialPlayer?: {
    id?: string;
    name?: string;
    club?: string;
    position?: string;
  };
  currentUser: {
    name: string;
    role: string;
    orgId: string;
  };
}

export const SpondaReportEditorModal: React.FC<SpondaReportEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  onChangePlayer,
  allPlayers = [],
  initialPlayer,
  currentUser,
}) => {
  // Player info
  const [playerId, setPlayerId] = useState(initialPlayer?.id || "");
  const [playerName, setPlayerName] = useState(initialPlayer?.name || "");
  const [playerClub, setPlayerClub] = useState(initialPlayer?.club || "");
  const [scoutName, setScoutName] = useState(currentUser.name || "");

  // In-modal live player search dropdown & custom player creation
  const [playerSearchInput, setPlayerSearchInput] = useState("");
  const [isSearchingPlayer, setIsSearchingPlayer] = useState(false);
  const [showCreatePlayerInline, setShowCreatePlayerInline] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerClub, setNewPlayerClub] = useState("");
  const [newPlayerPos, setNewPlayerPos] = useState("Central Midfielder (CM)");

  // Match Picker / Manual entry mode
  const [matchMode, setMatchMode] = useState<"database" | "manual">("database");
  const [matchSearch, setMatchSearch] = useState("");
  const [matchSearchResults, setMatchSearchResults] = useState<any[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  const [manualFixture, setManualFixture] = useState("");
  const [manualDate, setManualDate] = useState(new Date().toISOString().split("T")[0]);
  const [manualCompetition, setManualCompetition] = useState("Official League");

  // SPONDA Form Fields
  const [ratingStars, setRatingStars] = useState<number>(3.5);
  const [bestPosition, setBestPosition] = useState<string[]>(
    initialPlayer?.position ? [initialPlayer.position] : ["Central Midfielder (CM)"]
  );
  const [secondaryPositions, setSecondaryPositions] = useState<string[]>([]);
  const [role, setRole] = useState(SPONDA_ROLES[1]); // Starter
  const [reputation, setReputation] = useState(SPONDA_REPUTATION[1]); // National
  const [reputationPotential, setReputationPotential] = useState(SPONDA_REPUTATION[0]); // Global
  const [developmentPotential, setDevelopmentPotential] = useState(SPONDA_DEVELOPMENT_POTENTIAL[0]); // High
  const [scoutingStatus, setScoutingStatus] = useState(SPONDA_SCOUTING_STATUS[0]); // Priority
  const [typeOfPlayer, setTypeOfPlayer] = useState(SPONDA_TYPE_OF_PLAYER[4]); // Creative Player
  const [positionalProfile, setPositionalProfile] = useState("Controler");
  const [tecTacTags, setTecTacTags] = useState<string[]>([
    "Line-Breaking Pass",
    "Oriented Reception",
    "Game Vision",
  ]);
  const [debilities, setDebilities] = useState<string[]>(["Aerial Balls"]);
  const [transferRisk, setTransferRisk] = useState(SPONDA_TRANSFER_RISK[0]); // Low
  const [scoutDecision, setScoutDecision] = useState(SPONDA_SCOUT_DECISION[0]); // To Sign
  const [specialities, setSpecialities] = useState<string[]>(["Final Pass", "Metronome"]);
  const [clubsStatus, setClubsStatus] = useState(SPONDA_CLUBS_STATUS[1]); // TOP 3
  const [pros, setPros] = useState("");
  const [cons, setCons] = useState("");
  const [scoutOpinion, setScoutOpinion] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [visibility, setVisibility] = useState<"club_private" | "author_private">("club_private");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "tactical" | "evaluation" | "media">("general");

  // Sync initialPlayer changes
  useEffect(() => {
    if (initialPlayer) {
      if (initialPlayer.id) setPlayerId(initialPlayer.id);
      if (initialPlayer.name) setPlayerName(initialPlayer.name);
      if (initialPlayer.club) setPlayerClub(initialPlayer.club);
      if (initialPlayer.position) setBestPosition([initialPlayer.position]);
    }
  }, [initialPlayer]);

  // Search matches from database: prioritized to player's matches and player's club matches
  useEffect(() => {
    if (!isOpen || matchMode !== "database") return;
    const query = matchSearch.trim();
    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      if (playerId) params.set("playerId", playerId);
      if (playerClub) params.set("club", playerClub);

      // If no player/club set, fallback to recent results
      if (!playerId && !playerClub && !query) {
        params.set("tab", "results");
      }

      fetch(`/api/matches?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => setMatchSearchResults(data.matches || []))
        .catch(() => setMatchSearchResults([]));
    }, 200);
    return () => clearTimeout(timeout);
  }, [matchSearch, matchMode, isOpen, playerId, playerClub]);

  const toggleMultiSelect = (
    currentList: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    item: string,
    maxLimit?: number
  ) => {
    if (currentList.includes(item)) {
      setList(currentList.filter((x) => x !== item));
    } else {
      if (maxLimit && currentList.length >= maxLimit) {
        setList([...currentList.slice(1), item]);
      } else {
        setList([...currentList, item]);
      }
    }
  };

  const handleSave = async () => {
    if (!playerName.trim()) {
      alert("Please enter target player name.");
      return;
    }
    if (!scoutName.trim()) {
      alert("Please enter the scout's name.");
      return;
    }

    setIsSubmitting(true);
    try {
      const matchFixtureTitle =
        matchMode === "database" && selectedMatch
          ? `${selectedMatch.home.name} vs ${selectedMatch.away.name}`
          : manualFixture || "Observation Match";

      const finalMatchDate =
        matchMode === "database" && selectedMatch?.date
          ? selectedMatch.date.slice(0, 10)
          : manualDate;

      const finalCompetition =
        matchMode === "database" && selectedMatch?.competition
          ? selectedMatch.competition
          : manualCompetition;

      const spondaPayload: SpondaReportData = {
        scoutName,
        ratingStars,
        bestPosition,
        secondaryPositions,
        role,
        reputation,
        reputationPotential,
        developmentPotential,
        scoutingStatus,
        typeOfPlayer,
        positionalProfile,
        tecTacTags,
        debilities,
        transferRisk,
        scoutDecision,
        specialities,
        clubsStatus,
        pros,
        cons,
        scoutOpinion,
        videoUrl,
      };

      const payload = {
        organizationId: currentUser.orgId,
        reportType: "full_scouting",
        status: "draft",
        visibility,
        playerId: playerId || "custom-player",
        playerName,
        playerClub,
        primaryPosition: bestPosition[0] || "Unspecified",
        matchId: matchMode === "database" ? selectedMatch?.id || null : null,
        matchFixture: matchFixtureTitle,
        competition: finalCompetition,
        observationDate: finalMatchDate,
        tacticalContext: `${role} • ${positionalProfile} (${clubsStatus})`,
        scoutName,
        ratings: {
          technical: ratingStars * 2,
          tactical: ratingStars * 2,
          physical: ratingStars * 2,
          psychological: null,
        },
        strengths: specialities,
        weaknesses: debilities,
        recommendation:
          scoutDecision === "To Sign"
            ? "sign_tier_a"
            : scoutDecision === "To Monitor"
            ? "monitor_tier_b"
            : "pass",
        freeTextNotes: scoutOpinion || pros || cons,
        spondaData: spondaPayload,
      };

      await onSave(payload);
      onClose();
    } catch (err: any) {
      console.error(err);
      alert("Failed to save report: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="SPONDA Professional Scouting Report"
      description="Compile structured tactical, positional, and scouting dossier directly aligned with the official SPONDA criteria."
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Scout Name:</span>
            <span className="text-xs font-semibold text-white">{scoutName || "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              isLoading={isSubmitting}
              leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-400" />}
            >
              Commit &amp; File Dossier
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 text-xs">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-navy-950/80 border border-white/10 backdrop-blur-sm">
          {[
            { id: "general", label: "1. Match & Identity" },
            { id: "tactical", label: "2. Tactical & Roles" },
            { id: "evaluation", label: "3. Tags & Evaluation" },
            { id: "media", label: "4. Notes & Media" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-1.5 text-center font-bold text-xs rounded-lg transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-slate-950 shadow-md shadow-primary/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: MATCH & IDENTITY */}
        {activeTab === "general" && (
          <div className="space-y-4">
            {/* Target Player Banner & Scout Info */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 via-navy-900/60 to-navy-900/40 border border-primary/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shrink-0">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-black tracking-wider text-primary block">
                      Target Player Selected
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-extrabold text-white">
                        {playerName || "No player selected"}
                      </span>
                      {playerClub && (
                        <span className="text-xs text-slate-300 font-semibold bg-white/10 px-2 py-0.5 rounded-md">
                          {playerClub}
                        </span>
                      )}
                      {bestPosition[0] && (
                        <span className="text-xs text-primary font-mono bg-primary/10 border border-primary/30 px-2 py-0.5 rounded-md">
                          {bestPosition[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSearchingPlayer(true);
                      setShowCreatePlayerInline(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                      isSearchingPlayer
                        ? "bg-primary text-slate-950 font-black ring-2 ring-primary/40"
                        : "bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40"
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Search / Select Player</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreatePlayerInline(true);
                      setIsSearchingPlayer(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                      showCreatePlayerInline
                        ? "bg-amber-400 text-slate-950 font-black ring-2 ring-amber-400/40"
                        : "bg-white/10 hover:bg-white/20 border border-white/20 text-white"
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Create New Player</span>
                  </button>
                </div>
              </div>

              {/* Integrated Instant Player Search Box */}
              {isSearchingPlayer && (
                <div className="p-3.5 rounded-xl bg-[#081024] border-2 border-primary/50 space-y-2 mt-2 shadow-xl animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white flex items-center gap-1.5">
                      <Search className="w-4 h-4 text-primary" />
                      Search &amp; Select Player from Database:
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsSearchingPlayer(false)}
                      className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-white/5"
                    >
                      Close Search
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={playerSearchInput}
                      onChange={(e) => setPlayerSearchInput(e.target.value)}
                      placeholder="Type player name or team (e.g. Alexia Putellas, Salma Paralluelo, Aitana Bonmatí)..."
                      className="w-full pl-9 pr-3 py-2 bg-[#0b1329] border border-primary/40 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-white/5 border border-white/10 rounded-lg bg-[#070e1e]">
                    {allPlayers
                      .filter((p) => {
                        if (!playerSearchInput.trim()) return true;
                        const q = playerSearchInput.toLowerCase().trim();
                        const pName = (p.matchName || p.name || "").toLowerCase();
                        const pTeam = (p.teamName || p.teams?.name || "").toLowerCase();
                        return pName.includes(q) || pTeam.includes(q);
                      })
                      .slice(0, 25)
                      .map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            setPlayerId(p.id);
                            setPlayerName(p.matchName || p.name);
                            setPlayerClub(p.teamName || p.teams?.name || "");
                            if (p.position || p.primary_position) {
                              setBestPosition([p.position || p.primary_position]);
                            }
                            setIsSearchingPlayer(false);
                            setPlayerSearchInput("");
                            setSelectedMatch(null);
                          }}
                          className="p-2.5 flex items-center justify-between hover:bg-primary/20 cursor-pointer transition-colors group"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 flex items-center justify-center font-bold text-[10px] text-white shrink-0">
                              {p.photoUrl || p.photo_url ? (
                                <img src={p.photoUrl || p.photo_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                (p.name || "P").slice(0, 2).toUpperCase()
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-white text-xs block group-hover:text-primary">
                                {p.matchName || p.name}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {p.teamName || p.teams?.name || "Without club"} • {p.position || p.primary_position || "Player"}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-primary group-hover:underline">
                            Select ✓
                          </span>
                        </div>
                      ))}
                    {allPlayers.length > 0 &&
                      allPlayers.filter((p) => {
                        if (!playerSearchInput.trim()) return true;
                        const q = playerSearchInput.toLowerCase().trim();
                        const pName = (p.matchName || p.name || "").toLowerCase();
                        const pTeam = (p.teamName || p.teams?.name || "").toLowerCase();
                        return pName.includes(q) || pTeam.includes(q);
                      }).length === 0 && (
                        <div className="p-4 text-center space-y-2">
                          <p className="text-xs text-slate-400">
                            No database players found matching &quot;{playerSearchInput}&quot;.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setNewPlayerName(playerSearchInput.trim());
                              setShowCreatePlayerInline(true);
                              setIsSearchingPlayer(false);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary/20 text-primary border border-primary/40 font-bold text-xs hover:bg-primary/30"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Create new player &quot;{playerSearchInput.trim()}&quot;
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              )}

              {/* Integrated Create New Player Form */}
              {showCreatePlayerInline && (
                <div className="p-3.5 rounded-xl bg-navy-950 border-2 border-amber-500/50 space-y-3 mt-2 shadow-xl animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4 text-amber-400" />
                      Create New Player Profile (Not in Opta database yet):
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCreatePlayerInline(false)}
                      className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-white/5"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-200 block mb-1">
                        Full Player Name <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={newPlayerName}
                        onChange={(e) => setNewPlayerName(e.target.value)}
                        placeholder="e.g. Maria Gonzalez"
                        className="w-full px-2.5 py-1.5 bg-[#0b1329] border border-border/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-200 block mb-1">
                        Current Club / Team
                      </label>
                      <input
                        type="text"
                        value={newPlayerClub}
                        onChange={(e) => setNewPlayerClub(e.target.value)}
                        placeholder="e.g. Levante Badalona"
                        className="w-full px-2.5 py-1.5 bg-[#0b1329] border border-border/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-200 block mb-1">
                        Primary Position
                      </label>
                      <input
                        type="text"
                        value={newPlayerPos}
                        onChange={(e) => setNewPlayerPos(e.target.value)}
                        placeholder="e.g. Left Winger (LW)"
                        className="w-full px-2.5 py-1.5 bg-[#0b1329] border border-border/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCreatePlayerInline(false)}
                      className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!newPlayerName.trim()) {
                          alert("Please provide the player's name.");
                          return;
                        }
                        setPlayerId(`custom-${Date.now()}`);
                        setPlayerName(newPlayerName.trim());
                        setPlayerClub(newPlayerClub.trim() || "Independent");
                        setBestPosition([newPlayerPos.trim() || "Central Midfielder (CM)"]);
                        setShowCreatePlayerInline(false);
                        setSelectedMatch(null);
                      }}
                      className="px-4 py-1.5 rounded-lg bg-amber-400 text-slate-950 text-xs font-black hover:bg-amber-300 transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Set as Target Player</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Scout & Player Identity Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-navy-900/60 border border-white/10">
              <div>
                <label className="font-bold text-slate-200 block mb-1">
                  Lead Scout Name <span className="text-amber-400">*</span>
                </label>
                <Input
                  value={scoutName}
                  onChange={(e) => setScoutName(e.target.value)}
                  placeholder="e.g. Marc Valiente"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-200">
                    Target Player Name <span className="text-amber-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSearchingPlayer(true);
                      setShowCreatePlayerInline(false);
                    }}
                    className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                  >
                    <Search className="w-3 h-3" />
                    Browse Existing
                  </button>
                </div>
                <Input
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="e.g. Alexia Putellas"
                />
              </div>
              <div>
                <label className="font-bold text-slate-200 block mb-1">Current Club</label>
                <Input
                  value={playerClub}
                  onChange={(e) => setPlayerClub(e.target.value)}
                  placeholder="e.g. FC Barcelona"
                />
              </div>
            </div>

            {/* Observed Match Section: Database Picker vs Manual Entry */}
            <div className="p-3.5 rounded-xl bg-navy-900/60 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Observed Match / Fixture
                </span>
                <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10">
                  <button
                    type="button"
                    onClick={() => setMatchMode("database")}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                      matchMode === "database"
                        ? "bg-primary text-slate-950"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Select from Matches Hub
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatchMode("manual")}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                      matchMode === "manual"
                        ? "bg-primary text-slate-950"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Enter Manually
                  </button>
                </div>
              </div>

              {matchMode === "database" ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder={
                        playerClub
                          ? `Showing fixtures for ${playerClub} / ${playerName || "player"} (type to search other fixtures)...`
                          : "Search fixture by team or competition (e.g. Arsenal, Chelsea, Barcelona)..."
                      }
                      value={matchSearch}
                      onChange={(e) => setMatchSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-navy-950 border border-white/15 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                    />
                  </div>

                  {selectedMatch && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400" />
                        <div>
                          <div className="font-bold text-white text-xs">
                            {selectedMatch.home.name} {selectedMatch.home.score ?? ""} -{" "}
                            {selectedMatch.away.score ?? ""} {selectedMatch.away.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {new Date(selectedMatch.date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}{" "}
                            • {selectedMatch.competition}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMatch(null)}
                        className="text-[10.5px] font-bold text-slate-400 hover:text-white underline"
                      >
                        Change
                      </button>
                    </div>
                  )}

                  {!selectedMatch && (
                    <div className="max-h-40 overflow-y-auto divide-y divide-white/5 border border-white/10 rounded-lg bg-navy-950/80">
                      {matchSearchResults.length === 0 ? (
                        <div className="p-4 text-center text-[11px] text-slate-500">
                          No matches found. Try searching by club name or switch to &quot;Enter Manually&quot;.
                        </div>
                      ) : (
                        matchSearchResults.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => setSelectedMatch(m)}
                            className="p-2 flex items-center justify-between hover:bg-white/[0.06] cursor-pointer transition-colors"
                          >
                            <span className="font-semibold text-slate-200">
                              {m.home.name} vs {m.away.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(m.date).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                              })}{" "}
                              • {m.competition}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-0.5">
                      Fixture / Teams Matchup
                    </label>
                    <Input
                      value={manualFixture}
                      onChange={(e) => setManualFixture(e.target.value)}
                      placeholder="e.g. Lyon vs PSG"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-0.5">
                      Date Observed
                    </label>
                    <Input
                      type="date"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-0.5">
                      Competition / Tournament
                    </label>
                    <Input
                      value={manualCompetition}
                      onChange={(e) => setManualCompetition(e.target.value)}
                      placeholder="e.g. Première Ligue"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Stars Rating (1 to 5, 0.5 Scale) */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 flex items-center justify-between">
              <div>
                <span className="font-black uppercase tracking-wider text-amber-300 block text-xs">
                  Overall Rating (Stars)
                </span>
                <span className="text-[11px] text-slate-400">Official 1.0 to 5.0 (0.5 scale)</span>
              </div>
              <div className="flex items-center gap-1.5">
                {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setRatingStars(val)}
                    className={`px-2 py-1 rounded-md font-mono font-bold text-xs transition-all ${
                      ratingStars === val
                        ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-400/30 font-black scale-105"
                        : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    ★ {val}
                  </button>
                ))}
              </div>
            </div>

            {/* Position Picker: Best Position & Secondary Positions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-xl bg-navy-900/60 border border-white/10">
              <div>
                <label className="font-bold text-white block mb-1">
                  Best Position <span className="text-[10px] text-slate-400 font-normal">(Pick 1 or 2)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SPONDA_POSITIONS.map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => toggleMultiSelect(bestPosition, setBestPosition, pos, 2)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        bestPosition.includes(pos)
                          ? "bg-primary text-slate-950 font-bold"
                          : "bg-white/5 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-white block mb-1">
                  Secondary Positions <span className="text-[10px] text-slate-400 font-normal">(Multi-select)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SPONDA_POSITIONS.map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => toggleMultiSelect(secondaryPositions, setSecondaryPositions, pos)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        secondaryPositions.includes(pos)
                          ? "bg-amber-400 text-slate-950 font-bold"
                          : "bg-white/5 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TACTICAL & ROLES */}
        {activeTab === "tactical" && (
          <div className="space-y-4">
            {/* Role, Reputation & Potential Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-navy-900/60 border border-white/10">
                <label className="font-bold text-white block mb-1">Role in Squad</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full py-1.5 px-2 rounded-lg bg-navy-950 border border-white/15 text-xs text-white"
                >
                  {SPONDA_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-navy-900/60 border border-white/10">
                <label className="font-bold text-white block mb-1">Reputation Current</label>
                <select
                  value={reputation}
                  onChange={(e) => setReputation(e.target.value)}
                  className="w-full py-1.5 px-2 rounded-lg bg-navy-950 border border-white/15 text-xs text-white"
                >
                  {SPONDA_REPUTATION.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-navy-900/60 border border-white/10">
                <label className="font-bold text-white block mb-1">Reputation Potential</label>
                <select
                  value={reputationPotential}
                  onChange={(e) => setReputationPotential(e.target.value)}
                  className="w-full py-1.5 px-2 rounded-lg bg-navy-950 border border-white/15 text-xs text-white"
                >
                  {SPONDA_REPUTATION.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Development Potential, Scouting Status & Type of Player */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-navy-900/60 border border-white/10">
                <label className="font-bold text-white block mb-1">Development Potential</label>
                <select
                  value={developmentPotential}
                  onChange={(e) => setDevelopmentPotential(e.target.value)}
                  className="w-full py-1.5 px-2 rounded-lg bg-navy-950 border border-white/15 text-xs text-white"
                >
                  {SPONDA_DEVELOPMENT_POTENTIAL.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-navy-900/60 border border-white/10">
                <label className="font-bold text-white block mb-1">Scouting Status</label>
                <select
                  value={scoutingStatus}
                  onChange={(e) => setScoutingStatus(e.target.value)}
                  className="w-full py-1.5 px-2 rounded-lg bg-navy-950 border border-white/15 text-xs text-white"
                >
                  {SPONDA_SCOUTING_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-navy-900/60 border border-white/10">
                <label className="font-bold text-white block mb-1">Type of Player</label>
                <select
                  value={typeOfPlayer}
                  onChange={(e) => setTypeOfPlayer(e.target.value)}
                  className="w-full py-1.5 px-2 rounded-lg bg-navy-950 border border-white/15 text-xs text-white"
                >
                  {SPONDA_TYPE_OF_PLAYER.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Positional Profile & Clubs Status Target */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-xl bg-navy-900/60 border border-white/10">
              <div>
                <label className="font-bold text-white block mb-1">Positional Profile Archetype</label>
                <select
                  value={positionalProfile}
                  onChange={(e) => setPositionalProfile(e.target.value)}
                  className="w-full py-1.5 px-2 rounded-lg bg-navy-950 border border-white/15 text-xs text-white"
                >
                  {SPONDA_POSITIONAL_PROFILES.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-white block mb-1">Club Target Standard (Club Status)</label>
                <select
                  value={clubsStatus}
                  onChange={(e) => setClubsStatus(e.target.value)}
                  className="w-full py-1.5 px-2 rounded-lg bg-navy-950 border border-white/15 text-xs text-white"
                >
                  {SPONDA_CLUBS_STATUS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TAGS & EVALUATION */}
        {activeTab === "evaluation" && (
          <div className="space-y-4">
            {/* Tec-Tac Tags (Technical & Tactical Tags) */}
            <div className="p-3.5 rounded-xl bg-navy-900/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs">
                  Technical-Tactical Tags (Tec-Tac)
                </span>
                <span className="text-[10px] text-primary font-mono">
                  {tecTacTags.length} selected
                </span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {SPONDA_TEC_TAC_TAGS.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      {cat.category}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {cat.tags.map((tag) => {
                        const isSelected = tecTacTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleMultiSelect(tecTacTags, setTecTacTags, tag)}
                            className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors ${
                              isSelected
                                ? "bg-primary text-slate-950 font-bold"
                                : "bg-black/40 text-slate-300 hover:bg-white/10"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Specialities (Strengths / Superpowers) */}
            <div className="p-3.5 rounded-xl bg-navy-900/60 border border-white/10 space-y-2">
              <span className="font-bold text-white text-xs block">
                Player Specialities (Key Qualities)
              </span>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {SPONDA_SPECIALITIES.map((grp) => (
                  <div key={grp.group} className="space-y-1">
                    <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wide">
                      {grp.group}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {grp.items.map((spec) => {
                        const isSelected = specialities.includes(spec);
                        return (
                          <button
                            key={spec}
                            type="button"
                            onClick={() => toggleMultiSelect(specialities, setSpecialities, spec)}
                            className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors ${
                              isSelected
                                ? "bg-amber-400 text-slate-950 font-bold"
                                : "bg-black/40 text-slate-300 hover:bg-white/10"
                            }`}
                          >
                            {spec}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Debilities & Risks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-navy-900/60 border border-white/10 space-y-1.5">
                <span className="font-bold text-white text-xs block">
                  Debilities (Areas to Improve)
                </span>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {SPONDA_DEBILITIES.map((deb) => {
                    const isSelected = debilities.includes(deb);
                    return (
                      <button
                        key={deb}
                        type="button"
                        onClick={() => toggleMultiSelect(debilities, setDebilities, deb)}
                        className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors ${
                          isSelected
                            ? "bg-red-500/20 text-red-300 border border-red-500/40 font-bold"
                            : "bg-black/40 text-slate-300 hover:bg-white/10"
                        }`}
                      >
                        {deb}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-navy-900/60 border border-white/10 space-y-3">
                <div>
                  <label className="font-bold text-white block mb-1">Transfer Risk Level</label>
                  <select
                    value={transferRisk}
                    onChange={(e) => setTransferRisk(e.target.value)}
                    className="w-full py-1.5 px-2 rounded-lg bg-navy-950 border border-white/15 text-xs text-white"
                  >
                    {SPONDA_TRANSFER_RISK.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Scout Decision</label>
                  <select
                    value={scoutDecision}
                    onChange={(e) => setScoutDecision(e.target.value)}
                    className="w-full py-1.5 px-2 rounded-lg bg-navy-950 border border-white/15 text-xs text-white font-bold"
                  >
                    {SPONDA_SCOUT_DECISION.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: NOTES & MEDIA */}
        {activeTab === "media" && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-white block mb-1">Pros</label>
                <textarea
                  className="w-full h-20 rounded-lg border border-white/15 bg-navy-950 p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                  value={pros}
                  onChange={(e) => setPros(e.target.value)}
                  placeholder="Key positive tactical takeaways..."
                />
              </div>
              <div>
                <label className="font-bold text-white block mb-1">Cons</label>
                <textarea
                  className="w-full h-20 rounded-lg border border-white/15 bg-navy-950 p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                  value={cons}
                  onChange={(e) => setCons(e.target.value)}
                  placeholder="Potential limitations or deficiencies..."
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-white block mb-1">Scout Opinion / Synthesis</label>
              <textarea
                className="w-full h-24 rounded-lg border border-white/15 bg-navy-950 p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                value={scoutOpinion}
                onChange={(e) => setScoutOpinion(e.target.value)}
                placeholder="Overall scout qualitative opinion, game impact, and signing suitability recommendation..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-white block mb-1 flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-primary" />
                  Video URL / Footage Link
                </label>
                <Input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://vimeo.com/... or Wyscout/Instat video link"
                />
              </div>
              <div>
                <label className="font-bold text-white block mb-1">Visibility Mode</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as any)}
                  className="w-full py-1.5 px-2 rounded-lg bg-navy-950 border border-white/15 text-xs text-white"
                >
                  <option value="club_private">Club Private (Shared across club scouting team)</option>
                  <option value="author_private">Author Private (Confidential Scout Draft)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

