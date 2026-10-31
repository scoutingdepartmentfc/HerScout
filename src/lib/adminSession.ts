/**
 * Platform admin session: an HMAC-signed, HTTP-only cookie "<expiry>.<signature>".
 * Uses Web Crypto so the same check runs in the Edge middleware and in API routes.
 * Credentials live in env vars (ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET), never in the repo.
 */

export const ADMIN_COOKIE = "hs_admin";
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("ADMIN_SESSION_SECRET is missing or too short");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

export async function createAdminToken() {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS;
  return `${exp}.${await sign(`admin:${process.env.ADMIN_EMAIL}:${exp}`)}`;
}

export async function isValidAdminToken(token: string | undefined | null) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  try {
    const expected = await sign(`admin:${process.env.ADMIN_EMAIL}:${exp}`);
    // Constant-time comparison
    if (expected.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}
