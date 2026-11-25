import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function sealSession(inviteId: string, secret: string, ttlMs = 2 * 3600e3, now = Date.now()) {
  const body = `${inviteId}.${now + ttlMs}`;
  return `${body}.${mac(body, secret)}`;
}
export function openSession(value: string | undefined, secret: string, now = Date.now()) {
  const [id, exp, sig] = (value ?? "").split(".");
  if (!id || !exp || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(`${id}.${exp}`, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Number(exp) > now ? id : null;
}
