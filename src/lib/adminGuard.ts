import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ADMIN_COOKIE, isValidAdminToken } from "@/lib/adminSession";

/**
 * Admin API guard: a valid admin session cookie (the middleware already checks it; repeated here
 * so a route never relies on the matcher alone) and the Supabase service role key.
 * Returns an error response, or null when the request can go ahead.
 */
export async function requireAdmin(req: NextRequest) {
  if (!(await isValidAdminToken(req.cookies.get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: "Platform admin login required" }, { status: 401 });
  }
  if (!supabaseAdmin || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }
  return null;
}
