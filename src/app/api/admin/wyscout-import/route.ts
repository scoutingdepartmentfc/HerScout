import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin as any;
  try {
    const { data: comps, error } = await db
      .from("competitions")
      .select("id, name, country, code, active_season_id, updated_at")
      .like("id", "wyscout-%")
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const list = comps || [];
    const compIds = list.map((c: any) => c.id);
    if (!compIds.length) return NextResponse.json({ leagues: [] });

    const [teamsRes, pssRes] = await Promise.all([
      db.from("teams").select("id, competition_id, badge_url").in("competition_id", compIds),
      db.from("player_season_stats").select("competition_id, player_id, players ( photo_url )").in("competition_id", compIds),
    ]);

    const stats: Record<string, { teams: number; crests: number; players: number; photos: number }> = {};
    for (const id of compIds) stats[id] = { teams: 0, crests: 0, players: 0, photos: 0 };

    for (const t of teamsRes.data || []) {
      const s = stats[t.competition_id];
      if (!s) continue;
      s.teams += 1;
      if (t.badge_url) s.crests += 1;
    }
    for (const r of pssRes.data || []) {
      const s = stats[r.competition_id];
      if (!s) continue;
      s.players += 1;
      if (r.players?.photo_url) s.photos += 1;
    }

    return NextResponse.json({
      leagues: list.map((c: any) => ({ ...c, ...(stats[c.id] || { teams: 0, crests: 0, players: 0, photos: 0 }) })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  let tmpPath = "";
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Adjunta un archivo Excel (.xlsx)." }, { status: 400 });
    }
    const leagueName = String(form.get("leagueName") || "").trim() || file.name.replace(/\.(xlsx?|csv)$/i, "");
    const conference = String(form.get("conference") || "").trim();
    const country = String(form.get("country") || "USA").trim() || "USA";
    const seasonName = String(form.get("seasonName") || "2026").trim() || "2026";
    const espnUrl = String(form.get("espnUrl") || "").trim();
    const fetchPhotos = String(form.get("fetchPhotos") || "false") === "true";

    const buf = Buffer.from(await file.arrayBuffer());
    tmpPath = path.join(tmpdir(), `wyscout-${Date.now()}-${path.basename(file.name)}`);
    await writeFile(tmpPath, buf);

    const args = [
      "-u", "-m", "pipeline.wyscout_excel",
      "--file", tmpPath,
      "--league", leagueName,
      "--conference", conference,
      "--country", country,
      "--season", seasonName,
      "--espn-url", espnUrl,
      "--progress",
    ];
    if (fetchPhotos) args.push("--photos");

    const encoder = new TextEncoder();
    const fileToClean = tmpPath;
    tmpPath = ""; // cleaned up when stream closes

    const stream = new ReadableStream({
      start(controller) {
        const send = (obj: unknown) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        };

        const child = spawn("python3", args, {
          cwd: process.cwd(),
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        });

        let stdoutBuf = "";
        let stderrBuf = "";
        let lastJsonLine = "";

        child.stdout.on("data", (chunk: Buffer) => {
          stdoutBuf += chunk.toString("utf-8");
          const lines = stdoutBuf.split("\n");
          stdoutBuf = lines.pop() ?? "";
          for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;
            if (line.startsWith("PROGRESS:")) {
              try {
                const payload = JSON.parse(line.slice("PROGRESS:".length));
                send({ type: "progress", ...payload });
              } catch { /* ignore malformed progress line */ }
            } else {
              lastJsonLine = line;
            }
          }
        });

        child.stderr.on("data", (chunk: Buffer) => {
          stderrBuf = (stderrBuf + chunk.toString("utf-8")).slice(-1500);
        });

        child.on("error", (err) => {
          send({ type: "error", error: err.message });
          unlink(fileToClean).catch(() => {});
          controller.close();
        });

        child.on("close", (code) => {
          const tail = stdoutBuf.trim();
          if (tail && !tail.startsWith("PROGRESS:")) lastJsonLine = tail;
          unlink(fileToClean).catch(() => {});
          if (code === 0 && lastJsonLine) {
            try {
              const summary = JSON.parse(lastJsonLine);
              (globalThis as { __herscoutPlayersCacheResetAt?: number }).__herscoutPlayersCacheResetAt = Date.now();
              send({ type: "done", summary });
            } catch {
              send({ type: "error", error: "Respuesta inválida del importador." });
            }
          } else {
            send({ type: "error", error: stderrBuf.slice(-600) || `Importador terminó con código ${code}` });
          }
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.stderr?.slice(-600) || e?.message || "Error importando Excel" },
      { status: 500 }
    );
  } finally {
    if (tmpPath) {
      await unlink(tmpPath).catch(() => {});
    }
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin as any;
  try {
    const { competitionId } = await req.json();
    if (!competitionId || !String(competitionId).startsWith("wyscout-")) {
      return NextResponse.json({ error: "competitionId inválido" }, { status: 400 });
    }
    const { error } = await db.from("competitions").delete().eq("id", competitionId);
    if (error) throw error;
    (globalThis as { __herscoutPlayersCacheResetAt?: number }).__herscoutPlayersCacheResetAt = Date.now();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
