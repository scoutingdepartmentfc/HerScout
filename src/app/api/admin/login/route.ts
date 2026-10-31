import { NextRequest, NextResponse } from "next/server";
import { checkAdminPassword } from "@/lib/adminPassword";
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, createAdminToken, isValidAdminToken } from "@/lib/adminSession";

export const runtime = "nodejs";

/**
 * Platform admin login. ADMIN_PASSWORD_HASH is "scrypt:<salt hex>:<hash hex>" (no "$": Next expands it in .env files), generated with:
 *   node -e "const c=require('crypto');const s=c.randomBytes(16);console.log('scrypt:'+s.toString('hex')+':'+c.scryptSync(process.argv[1],s,64).toString('hex'))" 'PASSWORD'
 */

// Who is logged in (the client uses it to show the Administration menu)
export async function GET(req: NextRequest) {
  const admin = await isValidAdminToken(req.cookies.get(ADMIN_COOKIE)?.value);
  return NextResponse.json({ admin, email: admin ? process.env.ADMIN_EMAIL : null });
}

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH || !process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json({ error: "Admin login is not configured on the server" }, { status: 500 });
  }
  const { email, password } = await req.json().catch(() => ({}));
  const ok =
    typeof email === "string" &&
    typeof password === "string" &&
    email.trim().toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase() &&
    checkAdminPassword(password);
  if (!ok) {
    // Slow down password guessing
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, await createAdminToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_SECONDS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
