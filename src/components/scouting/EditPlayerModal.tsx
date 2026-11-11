"use client";

import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { RotateCcw, Save } from "lucide-react";

// Position codes understood by the profile page (translatePosition / getPitchCoords) and the card
export const POSITIONS: { code: string; label: string }[] = [
  { code: "GK", label: "Goalkeeper" },
  { code: "RB", label: "Right-Back" },
  { code: "RCB", label: "Right Centre-Back" },
  { code: "CB", label: "Centre-Back" },
  { code: "LCB", label: "Left Centre-Back" },
  { code: "LB", label: "Left-Back" },
  { code: "CDM", label: "Defensive Midfielder" },
  { code: "CM", label: "Central Midfielder" },
  { code: "CAM", label: "Attacking Midfielder" },
  { code: "RW", label: "Right Winger" },
  { code: "LW", label: "Left Winger" },
  { code: "ST", label: "Centre-Forward" },
];

type FieldKind = "text" | "number" | "date" | "foot";
const FIELDS: { key: string; label: string; kind: FieldKind; placeholder?: string }[] = [
  { key: "matchName", label: "Display name", kind: "text" },
  { key: "name", label: "Full name", kind: "text" },
  { key: "country", label: "Nationality", kind: "text", placeholder: "England" },
  { key: "citizenship", label: "Citizenship (comma separated)", kind: "text", placeholder: "England, Italy" },
  { key: "birthDate", label: "Date of birth", kind: "date" },
  { key: "placeOfBirth", label: "Place of birth", kind: "text" },
  { key: "height", label: "Height (cm)", kind: "number" },
  { key: "weight", label: "Weight (kg)", kind: "number" },
  { key: "preferredFoot", label: "Preferred foot", kind: "foot" },
  { key: "shirtNumber", label: "Shirt number", kind: "number" },
  { key: "marketValue", label: "Market value (€)", kind: "number", placeholder: "1800000" },
  { key: "contractUntil", label: "Contract until", kind: "date" },
  { key: "joinedOn", label: "Joined on", kind: "date" },
  { key: "photoUrl", label: "Photo URL", kind: "text", placeholder: "https://…" },
];

/** Maps any stored position text ("Delantero centro", "Centre-Forward", "st"…) to one of the POSITIONS codes */
export function toPositionCode(pos: string | null | undefined, translate: (p: string) => string): string {
  if (!pos) return "";
  const upper = pos.toUpperCase();
  if (POSITIONS.some((p) => p.code === upper)) return upper;
  const label = translate(pos);
  return POSITIONS.find((p) => p.label === label)?.code || "";
}

const toInput = (key: string, v: any): string => {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (FIELDS.find((f) => f.key === key)?.kind === "date") return String(v).slice(0, 10);
  return String(v);
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  player: any; // merged player (scraped + manual overrides)
  scraped: any; // original scraped values, shown as hints
  translatePosition: (p: string) => string;
  onSaved: () => void;
}

export function EditPlayerModal({ isOpen, onClose, player, scraped, translatePosition, onSaved }: Props) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [primary, setPrimary] = useState("");
  const [others, setOthers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const f: Record<string, string> = {};
    for (const { key } of FIELDS) f[key] = toInput(key, player?.[key]);
    setForm(f);
    setPrimary(toPositionCode(player?.primaryPosition, translatePosition));
    setOthers(
      Array.from(
        new Set(
          (player?.otherPositions || [])
            .map((p: string) => toPositionCode(p, translatePosition))
            .filter(Boolean)
        )
      ) as string[]
    );
    setError(null);
  }, [isOpen, player, translatePosition]);

  const toggleOther = (code: string) =>
    setOthers((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const setPrimaryPos = (code: string) => {
    setPrimary(code);
    setOthers((prev) => prev.filter((c) => c !== code));
  };

  // Build the payload: only fields that differ from the scraped value are kept as overrides;
  // a field equal to the scraped value (or emptied) clears its override.
  const buildOverrides = () => {
    const out: Record<string, any> = {};
    for (const { key } of FIELDS) {
      const value = (form[key] ?? "").trim();
      const original = toInput(key, scraped?.[key]).trim();
      out[key] = value && value !== original ? (key === "citizenship" ? value.split(",") : value) : null;
    }
    const scrapedPrimary = toPositionCode(scraped?.primaryPosition, translatePosition);
    out.primaryPosition = primary && primary !== scrapedPrimary ? primary : null;
    const scrapedOthers = (scraped?.otherPositions || [])
      .map((p: string) => toPositionCode(p, translatePosition))
      .filter(Boolean)
      .sort()
      .join(",");
    const othersChanged = [...others].sort().join(",") !== scrapedOthers;
    // An empty list that differs from the scraped one is stored as ["-"] so "no secondary positions" sticks
    out.otherPositions = othersChanged ? (others.length ? others : ["-"]) : null;
    return out;
  };

  const save = async (overrides: Record<string, any>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/players/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || `HTTP error ${res.status}`);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not save the changes");
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    if (!window.confirm("Discard all manual edits and go back to the scraped data?")) return;
    const all: Record<string, null> = { primaryPosition: null, otherPositions: null };
    for (const { key } of FIELDS) all[key] = null;
    save(all);
  };

  const hasOverrides = Object.keys(player?.manualOverrides || {}).length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit player profile"
      description="Changes are saved in the database and take priority over Opta / Soccerdonna data."
      size="xl"
      footer={
        <>
          {hasOverrides && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAll}
              disabled={saving}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              className="mr-auto"
            >
              Reset to scraped data
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => save(buildOverrides())} disabled={saving} leftIcon={<Save className="w-3.5 h-3.5" />}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Positions */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Positions</h3>
          <div>
            <label className="text-[11px] text-muted-foreground">Primary position</label>
            <Select value={primary} onChange={(e) => setPrimaryPos(e.target.value)} className="mt-1">
              <option value="">—</option>
              {POSITIONS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label} ({p.code})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Other possible positions</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {POSITIONS.filter((p) => p.code !== primary).map((p) => {
                const active = others.includes(p.code);
                return (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => toggleOther(p.code)}
                    aria-pressed={active}
                    className={
                      "px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors " +
                      (active
                        ? "bg-amber-400/15 text-amber-300 border-amber-400/50"
                        : "bg-navy-900/60 text-slate-400 border-white/10 hover:text-white hover:border-white/30")
                    }
                    title={p.label}
                  >
                    {p.code} · {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Personal data */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Personal data</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIELDS.map(({ key, label, kind, placeholder }) => {
              const original = toInput(key, scraped?.[key]);
              const edited = key in (player?.manualOverrides || {});
              return (
                <div key={key}>
                  <label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    {label}
                    {edited && <span className="text-[9px] uppercase text-amber-400 font-bold">edited</span>}
                  </label>
                  <div className="mt-1">
                    {kind === "foot" ? (
                      <Select value={form[key] || ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
                        <option value="">—</option>
                        <option value="right">right</option>
                        <option value="left">left</option>
                        <option value="both">both</option>
                      </Select>
                    ) : (
                      <Input
                        type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
                        value={form[key] || ""}
                        placeholder={placeholder}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      />
                    )}
                  </div>
                  {edited && original && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">Scraped: {original}</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}
