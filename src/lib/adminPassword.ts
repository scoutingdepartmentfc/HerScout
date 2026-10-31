import { scryptSync, timingSafeEqual } from "crypto";

/** ADMIN_PASSWORD_HASH = "scrypt:<salt hex>:<hash hex>" (see src/app/api/admin/login/route.ts). Node runtime only. */
export function checkAdminPassword(password: unknown) {
  if (typeof password !== "string") return false;
  const [algo, salt, hash] = (process.env.ADMIN_PASSWORD_HASH || "").split(":");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  return timingSafeEqual(scryptSync(password, Buffer.from(salt, "hex"), expected.length), expected);
}
