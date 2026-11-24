import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ADMIN_COOKIE, isValidAdminToken } from "@/lib/adminSession";

/**
 * Equipos guardados del 11 Builder (tabla builder_teams, supabase/migrations/20261124180000_builder_teams.sql).
 *
 *   GET                       → { teams: [...] } (más recientes primero)
 *   POST   { name, formation, team, notes, teamNote, colors }        → { team } (nuevo)
 *   PUT    { id, name, formation, team, notes, teamNote, colors }    → { team } (sobrescribe)
 *   DELETE ?id=...            → { ok: true }
 *
 * El autor es el usuario de la sesión (hoy el login de administrador: ADMIN_EMAIL).
 */

export const runtime = "nodejs";

const FORMATIONS = new Set(["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "3-4-3", "5-3-2"]);
const MAX_PER_ROLE = 10;
const COLS = "id,name,formation,team,notes,team_note,colors,created_by_email,created_by_name,updated_by_email,updated_by_name,created_at,updated_at";

async function sessionUser(req: NextRequest): Promise<{ email: string | null; name: string } | null> {
  if (!(await isValidAdminToken(req.cookies.get(ADMIN_COOKIE)?.value))) return null;
  return { email: process.env.ADMIN_EMAIL || null, name: "Administrator" };
}

const toClient = (r: any) => ({
  id: r.id,
  name: r.name,
  formation: r.formation,
  team: r.team || {},
  notes: r.notes || {},
  teamNote: r.team_note || "",
  colors: r.colors || {},
  createdByName: r.created_by_name,
  createdByEmail: r.created_by_email,
  updatedByName: r.updated_by_name,
  createdAt: r.created_at,
  savedAt: r.updated_at,
});

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

/** Valida y limpia lo que manda el navegador */
function parseBody(body: any): { row: Record<string, any> } | { error: string } {
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 150) : "";
  if (!name) return { error: "The team needs a name" };
  if (!FORMATIONS.has(body?.formation)) return { error: "Unknown system" };
  if (!isObj(body?.team)) return { error: "Invalid team" };
  const team: Record<string, any[]> = {};
  for (const [role, list] of Object.entries(body.team)) {
    if (typeof role !== "string" || role.length > 8 || !Array.isArray(list)) return { error: "Invalid team" };
    team[role] = list.filter((p) => isObj(p) && typeof p.id === "string").slice(0, MAX_PER_ROLE);
  }
  const strMap = (v: unknown, max: number) =>
    Object.fromEntries(
      Object.entries(isObj(v) ? v : {})
        .filter(([, x]) => typeof x === "string" && x.trim())
        .map(([k, x]) => [k, (x as string).slice(0, max)])
    );
  return {
    row: {
      name,
      formation: body.formation,
      team,
      notes: strMap(body.notes, 5000),
      team_note: typeof body.teamNote === "string" ? body.teamNote.slice(0, 20000) : null,
      colors: Object.fromEntries(
        Object.entries(strMap(body.colors, 16)).filter(([, c]) => /^#[0-9a-f]{3,8}$/i.test(c as string))
      ),
    },
  };
}

function dbError(error: any) {
  const missing = /builder_teams/.test(error?.message || "") && /(does not exist|schema cache)/i.test(error?.message || "");
  return NextResponse.json(
    { error: missing ? "Missing table builder_teams: run supabase/migrations/20261124180000_builder_teams.sql" : error?.message || "Database error" },
    { status: 500 }
  );
}

export async function GET() {
  if (!supabaseAdmin) return NextResponse.json({ teams: [] });
  const { data, error } = await (supabaseAdmin as any).from("builder_teams").select(COLS).order("updated_at", { ascending: false });
  if (error) return dbError(error);
  return NextResponse.json({ teams: (data || []).map(toClient) });
}

export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const parsed = parseBody(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const now = new Date().toISOString();
  const { data, error } = await (supabaseAdmin as any)
    .from("builder_teams")
    .insert({
      ...parsed.row,
      created_by_email: user.email, created_by_name: user.name,
      updated_by_email: user.email, updated_by_name: user.name,
      created_at: now, updated_at: now,
    })
    .select(COLS)
    .single();
  if (error) return dbError(error);
  return NextResponse.json({ team: toClient(data) });
}

export async function PUT(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const body = await req.json().catch(() => null);
  if (typeof body?.id !== "string") return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const parsed = parseBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await (supabaseAdmin as any)
    .from("builder_teams")
    .update({ ...parsed.row, updated_by_email: user.email, updated_by_name: user.name, updated_at: new Date().toISOString() })
    .eq("id", body.id)
    .select(COLS)
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  return NextResponse.json({ team: toClient(data) });
}

export async function DELETE(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await (supabaseAdmin as any).from("builder_teams").delete().eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
