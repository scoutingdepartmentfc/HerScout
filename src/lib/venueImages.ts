import { supabaseAdmin } from "@/lib/supabase";

// Stadium photos for match cards. Resolved once from Wikipedia and persisted in
// public.venue_images, so each venue is only ever searched a single time.
// Wikipedia rate-limits bursts (HTTP 429): lookups go through a small queue with
// retry/backoff, and transient failures are never stored.

const LANGS = ["en", "es"];
const MAX_CONCURRENT = 2;
const RETRY_MISSING_MS = 90 * 24 * 60 * 60 * 1000;
// Wikimedia asks API clients to identify themselves with contact info; requests without it
// get rate-limited much sooner. Set WIKIMEDIA_CONTACT (a URL or email) in the environment.
const UA = `HerScoutVenueImages/1.0 (stadium backdrop lookup${
  process.env.WIKIMEDIA_CONTACT ? `; ${process.env.WIKIMEDIA_CONTACT}` : ""
})`;

export const venueKey = (name: string) => name.trim().toLowerCase();

type Row = { name_key: string; image_url: string | null; manual: boolean; checked_at: string };

// Memory layer in front of Supabase (also the fallback if the table doesn't exist yet)
const memory = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

const db = () => supabaseAdmin as any;

function isFresh(r: Row) {
  return r.image_url || r.manual || Date.now() - new Date(r.checked_at).getTime() < RETRY_MISSING_MS;
}

/** Known photos for a set of venue names (from memory/Supabase only, no Wikipedia calls).
 *  Returns key -> url|null for venues already resolved; unresolved venues are absent. */
export async function getStoredVenueImages(names: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const missing: string[] = [];
  for (const n of names) {
    const k = venueKey(n);
    if (memory.has(k)) out.set(k, memory.get(k)!);
    else missing.push(k);
  }
  const keys = Array.from(new Set(missing));
  // Chunks keep the PostgREST URL short (calendar months can list hundreds of venues)
  for (let i = 0; db() && i < keys.length; i += 80) {
    const { data, error } = await db()
      .from("venue_images")
      .select("name_key, image_url, manual, checked_at")
      .in("name_key", keys.slice(i, i + 80));
    if (error) break; // table missing → no stored photos (client resolves them lazily)
    for (const r of (data || []) as Row[]) {
      if (!isFresh(r)) continue;
      memory.set(r.name_key, r.image_url);
      out.set(r.name_key, r.image_url);
    }
  }
  return out;
}

/** Photo for one venue: memory → Supabase → Wikipedia (then saved to Supabase).
 *  Throws on transient Wikipedia failures so callers don't cache them. */
export async function resolveVenueImage(name: string): Promise<string | null> {
  const key = venueKey(name);
  const stored = await getStoredVenueImages([name]);
  if (stored.has(key)) return stored.get(key)!;

  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      const found = await searchWikipedia(name);
      memory.set(key, found?.url ?? null);
      if (db()) {
        await db().from("venue_images").upsert({
          name_key: key,
          venue_name: name.trim(),
          image_url: found?.url ?? null,
          wiki_title: found?.title ?? null,
          checked_at: new Date().toISOString(),
        });
      }
      return found?.url ?? null;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

// ---------------- Wikipedia ----------------

let active = 0;
const waiters: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isPhoto(src: string): boolean {
  const path = src.split("?")[0].toLowerCase();
  return !path.includes(".svg") && /\.(jpe?g|webp)$/.test(path);
}

// --- Guards against wrong articles (people, clubs, seasons, other stadiums) ---

// Article must be categorised as a venue / sports facility...
const VENUE_CATEGORY =
  /venues|stadiums|stadia|training grounds|football grounds|sports facilities|sports complexes|estadios|estadis|instalaciones deportivas|ciudades deportivas|campos de f[uú]tbol|stades|stadi |stadien|sportst[aä]tten/i;
// ...and must not be about a person
const PERSON_CATEGORY = /births|living people|deaths|nacidos|fallecidos|personas vivas/i;

// Generic words that don't identify a specific venue
const GENERIC = new Set(
  ("stadium stadion stadio stade estadio estadi estádio arena park parc parque field ground grounds pitch campo " +
    "camp terrain honneur ciudad ciutat cidade deportiva esportiva deportivo esportiu centro centre center sports " +
    "sport football futbol municipal instalaciones complex complejo training academy club the del de la las los " +
    "les des di della dello el y and von der am an im").split(" ")
);

function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function distinctiveTokens(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !GENERIC.has(t) && !/^\d+$/.test(t) && !/^z\d/.test(t))
  );
}
function sharesName(venue: string, title: string) {
  const a = distinctiveTokens(venue);
  const b = distinctiveTokens(title);
  if (!a.size || !b.size) return false;
  // One name must be fully contained in the other ("Zubieta" ⊂ "Instalaciones de Zubieta Campo Z-4"),
  // so "Giuseppe Piccolo" never matches "Giuseppe Grezar".
  const aInB = Array.from(a).every((t) => b.has(t));
  const bInA = Array.from(b).every((t) => a.has(t));
  return aInB || bInA;
}

type Page = { title: string; index?: number; thumbnail?: { source: string }; categories?: { title: string }[] };

function isVenuePage(p: Page) {
  const cats = (p.categories || []).map((c) => c.title).join(" | ");
  return VENUE_CATEGORY.test(cats) && !PERSON_CATEGORY.test(cats);
}

async function wikiQuery(lang: string, extra: Record<string, string>): Promise<Page[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "pageimages|categories",
    piprop: "thumbnail",
    pithumbsize: "1000",
    cllimit: "max",
    clshow: "!hidden",
    redirects: "1",
    ...extra,
  });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  if (res.status === 429 || res.status >= 500) {
    throw Object.assign(new Error(`wikipedia ${res.status}`), { retryAfter: Number(res.headers.get("retry-after")) });
  }
  if (!res.ok) return [];
  const json = await res.json();
  return (Object.values(json?.query?.pages || {}) as Page[]).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

async function lookupOnce(name: string, lang: string): Promise<{ url: string; title: string } | null> {
  const pick = (p?: Page) =>
    p?.thumbnail?.source && isPhoto(p.thumbnail.source) ? { url: p.thumbnail.source, title: p.title } : null;

  // 1) Exact article title or redirect (e.g. "polytec Stadium" -> Central Coast Stadium)
  const exact = (await wikiQuery(lang, { titles: name })).find((p) => !("missing" in p));
  if (exact && isVenuePage(exact)) return pick(exact);

  // 2) Full-text search: must be a venue article that shares a distinctive word with the name
  const results = await wikiQuery(lang, { generator: "search", gsrsearch: name, gsrlimit: "5" });
  const match = results.find((p) => isVenuePage(p) && sharesName(name, p.title));
  return pick(match);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withSlot(fn);
    } catch (e: any) {
      if (attempt >= 3) throw e;
      await sleep(Math.min(e?.retryAfter > 0 ? e.retryAfter * 1000 : 1000 * 2 ** attempt, 30000));
    }
  }
}

/** Wikipedia article photo (en → es), then Wikimedia Commons file search as fallback. */
export async function searchWikipedia(name: string) {
  for (const lang of LANGS) {
    const found = await withRetry(() => lookupOnce(name, lang));
    if (found) return found;
  }
  return withRetry(() => searchCommons(name));
}

// ---------------- Wikimedia Commons (fallback) ----------------
// Covers training grounds / sports cities without their own Wikipedia article
// (e.g. "Ciutat Esportiva Joan Gamper"). Commons files are filed under categories
// named after the venue, so the name check runs against file title + categories.

// Opta suffixes for individual pitches: "Campo 3", "Campo Z-4", "Camp 7", "Terrain N° 7"...
function stripPitchSuffix(name: string) {
  return name
    .replace(/\b(campo|camp|pitch|field|terrain|cancha)\s*(n[º°o]\.?\s*)?[a-z]?-?\d+[a-z]?\b/gi, " ")
    .replace(/\b(campo|camp)\s+[a-z]-?\d+\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const VENUE_WORDS =
  /stadium|stadion|stadio|stade|estadio|estadi|arena|ground|pitch|field|campo|camp |ciudad deportiva|ciutat esportiva|sports? (city|centre|center|complex|facilit)|training|instalaciones|facilities|football|f[uú]tbol|futbol|soccer|calcio/i;
const REJECT_FILE =
  /logo|crest|badge|escudo|emblem|map\b|mapa|plan\b|diagram|seating|portrait|retrato|births|living people|people of|personas|players|jugador|footballers|futbolistas|\.pdf|\.svg|\.png|\.gif|\.tiff?/i;

type CommonsPage = Page & { imageinfo?: { thumburl?: string; url?: string; width?: number; height?: number; mime?: string }[] };

async function searchCommons(name: string): Promise<{ url: string; title: string } | null> {
  const query = stripPitchSuffix(name);
  const wanted = Array.from(distinctiveTokens(query));
  if (!wanted.length) return null;

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6", // File:
    gsrsearch: query,
    gsrlimit: "15",
    prop: "imageinfo|categories",
    iiprop: "url|size|mime",
    iiurlwidth: "1280",
    cllimit: "max",
    clshow: "!hidden",
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  if (res.status === 429 || res.status >= 500) {
    throw Object.assign(new Error(`commons ${res.status}`), { retryAfter: Number(res.headers.get("retry-after")) });
  }
  if (!res.ok) return null;
  const json = await res.json();
  const files = (Object.values(json?.query?.pages || {}) as CommonsPage[]).sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0)
  );

  for (const f of files) {
    const info = f.imageinfo?.[0];
    if (!info?.thumburl || !/image\/(jpeg|webp)/.test(info.mime || "")) continue;
    const w = info.width || 0;
    const h = info.height || 0;
    if (w < 800 || w < h * 1.15) continue; // landscape photos only (cards are wide)

    const cats = (f.categories || []).map((c) => c.title.replace(/^Category:/, "")).join(" | ");
    const text = `${f.title} | ${cats}`;
    if (REJECT_FILE.test(text)) continue;
    if (!VENUE_WORDS.test(text)) continue;

    // Name check: every distinctive word of the venue, or at least 2 of 3+ (e.g. "Ciudad Deportiva
    // Javier Pérez" without "Tenerife"); "Giuseppe Piccolo" never matches "Giuseppe Grezar".
    const have = distinctiveTokens(text);
    const matched = wanted.filter((t) => have.has(t)).length;
    const ok = matched === wanted.length || (wanted.length >= 3 && matched >= Math.ceil((wanted.length * 2) / 3));
    if (!ok) continue;

    return { url: info.thumburl, title: f.title };
  }
  return null;
}
