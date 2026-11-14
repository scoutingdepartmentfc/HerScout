"use client";

import React from "react";
import { ScoutingReport } from "@/lib/reports";

/** Scouting report for PDF export (sporting director): white, English, every report field. Print-only. */

const LABELS: Record<string, string> = {
  technical: "Technical", tactical: "Tactical", physical: "Physical", psychological: "Psychological",
  low: "Low", medium: "Medium", high: "High", definitive: "Definitive",
  sign_tier_a: "Sign – Tier A", monitor_tier_b: "Monitor – Tier B", depth_tier_c: "Squad depth – Tier C", pass: "Pass",
};

const t = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—"
    : LABELS[String(v)] ?? String(v).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const date = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
};
const list = (v?: string[] | null) => (v && v.length ? v.join(" · ") : "—");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-slate-200 py-1">
          <dt className="text-slate-500 shrink-0">{k}</dt>
          <dd className="text-slate-900 font-medium text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Text({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="mb-3 break-inside-avoid">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <p className="text-[12px] leading-relaxed text-slate-900 whitespace-pre-wrap">{value?.trim() || "—"}</p>
    </div>
  );
}

function Bullets({ label, items }: { label: string; items?: string[] | null }) {
  return (
    <div className="break-inside-avoid">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      {items && items.length ? (
        <ul className="list-disc pl-4 text-[12px] text-slate-900 space-y-0.5">{items.map((i, n) => <li key={n}>{i}</li>)}</ul>
      ) : <p className="text-[12px] text-slate-900">—</p>}
    </div>
  );
}

export function ReportPrint({ report: r, clubName }: { report: ScoutingReport; clubName?: string }) {
  const s = r.spondaData || {};
  const ratings = Object.entries(r.ratings || {}) as [string, number | null][];
  return (
    <div className="hidden print:block bg-white text-slate-900 font-sans p-2" style={{ colorScheme: "light" }}>
      <style>{`@media print { @page { size: A4; margin: 14mm; } html, body { background: #fff !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      {/* Header */}
      <header className="flex items-center justify-between border-b-4 border-slate-900 pb-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-36 rounded-md bg-black"
            style={{ backgroundImage: "url(/logo2.png)", backgroundSize: "300px auto", backgroundPosition: "center 47%", backgroundRepeat: "no-repeat" }} />
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Scouting Report</div>
            {clubName && <div className="text-sm font-semibold">{clubName}</div>}
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-600">
          <div>Observed: {date(r.observationDate)}</div>
          <div>Report date: {date(r.updatedAt)}</div>
        </div>
      </header>

      {/* Player */}
      <div className="mt-5 flex items-center gap-5">
        {r.playerPhotoUrl && <img src={r.playerPhotoUrl} alt="" className="h-24 w-24 object-cover rounded border border-slate-200" />}
        <div className="flex-1">
          <h1 className="text-2xl font-bold leading-tight">{r.playerName}</h1>
          <div className="mt-1 flex items-center gap-2 text-[13px] text-slate-700">
            {r.playerClubBadgeUrl && <img src={r.playerClubBadgeUrl} alt="" className="h-5 w-5 object-contain" />}
            <span>{t(r.playerClub)}</span><span>·</span><span>{t(r.primaryPosition)}</span>
          </div>
          <div className="mt-2 inline-block text-[11px] font-semibold uppercase tracking-wider border border-slate-900 rounded px-2 py-0.5">
            {t(r.recommendation)}
          </div>
        </div>
        <div className="text-center border-2 border-slate-900 rounded px-4 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Overall rating</div>
          <div className="text-3xl font-bold">{r.overallRating != null ? r.overallRating.toFixed(1) : "—"}</div>
          {s.ratingStars != null && <div className="text-[11px] text-slate-600">{s.ratingStars} / 5 ★</div>}
        </div>
      </div>

      <Section title="Player profile">
        <Grid rows={[
          ["Name", t(r.playerName)], ["Club", t(r.playerClub)],
          ["Nationality", t(r.playerCountry)], ["Date of birth", date(r.playerBirthDate)],
          ["Age", t(r.playerAge)], ["Main position", t(r.primaryPosition)],
          ["Role on pitch", t(r.playerDemarcacion)], ["Best position", list(s.bestPosition)],
          ["Secondary positions", list(s.secondaryPositions)], ["Player type", t(s.typeOfPlayer)],
        ]} />
      </Section>

      <Section title="Observation">
        <Grid rows={[
          ["Report type", t(r.reportType)], ["Competition", t(r.competition)],
          ["Match", t(r.matchFixture)], ["Observation date", date(r.observationDate)],
          ["Scout", t(r.scoutName || s.scoutName || r.authorName)], ["Confidence", t(r.confidence)],
        ]} />
        <div className="mt-3"><Text label="Tactical context" value={r.tacticalContext} /></div>
      </Section>

      <Section title="Ratings">
        <div className="grid grid-cols-4 gap-3">
          {ratings.map(([k, v]) => (
            <div key={k} className="border border-slate-300 rounded p-2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{t(k)}</div>
              <div className="text-xl font-bold">{v != null ? v.toFixed(1) : "N/A"}</div>
              <div className="h-1.5 bg-slate-100 rounded mt-1"><div className="h-1.5 bg-slate-900 rounded" style={{ width: `${(v ?? 0) * 10}%` }} /></div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Scouting assessment">
        <Grid rows={[
          ["Role", t(s.role)], ["Positional profile", t(s.positionalProfile)],
          ["Current reputation", t(s.reputation)], ["Potential reputation", t(s.reputationPotential)],
          ["Development potential", t(s.developmentPotential)], ["Scouting status", t(s.scoutingStatus)],
          ["Scout decision", t(s.scoutDecision)], ["Recommendation", t(r.recommendation)],
          ["Transfer risk", t(s.transferRisk)], ["Club situation", t(s.clubsStatus)],
        ]} />
        <div className="grid grid-cols-3 gap-6 mt-4">
          <Bullets label="Technical / tactical traits" items={s.tecTacTags} />
          <Bullets label="Specialities" items={s.specialities} />
          <Bullets label="Weak points" items={s.debilities} />
        </div>
      </Section>

      <Section title="Analysis">
        <div className="grid grid-cols-3 gap-6">
          <Bullets label="Strengths" items={r.strengths} />
          <Bullets label="Weaknesses" items={r.weaknesses} />
          <Bullets label="Development areas" items={r.developmentAreas} />
        </div>
        <div className="grid grid-cols-2 gap-6 mt-4">
          <Text label="Pros" value={s.pros} />
          <Text label="Cons" value={s.cons} />
        </div>
        <Text label="Scout opinion" value={s.scoutOpinion} />
        <Text label="Additional notes" value={r.freeTextNotes} />
        {(s.videoUrl || (r.videoClipsUrls?.length ?? 0) > 0) && (
          <Bullets label="Video" items={[...(s.videoUrl ? [s.videoUrl] : []), ...(r.videoClipsUrls || [])]} />
        )}
      </Section>

      <footer className="mt-8 pt-2 border-t border-slate-300 text-[10px] text-slate-400 flex justify-between">
        <span>SPONDA{clubName ? ` · ${clubName}` : ""} · Confidential</span><span>Generated {date(new Date().toISOString())}</span>
      </footer>
    </div>
  );
}
