import crypto from "node:crypto";
import { USERS } from "./users.mjs";

const TOKEN_HOURS = 12;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET не задан в .env");
  return s;
}

const b64 = (str) => Buffer.from(str).toString("base64url");
const sign = (data) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

function same(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function checkPassword(login, password) {
  const user = USERS.find((u) => u.login === String(login).trim().toLowerCase());
  if (!user) return null;
  const [salt, hash] = user.hash.split(":");
  const test = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return same(test, hash) ? { login: user.login, role: user.role } : null;
}

export function makeToken(user) {
  const payload = b64(JSON.stringify({ ...user, exp: Date.now() + TOKEN_HOURS * 3600e3 }));
  return `${payload}.${sign(payload)}`;
}

const sealKey = () => crypto.createHash("sha256").update(secret() + ":seal").digest();

export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", sealKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64url");
}

export function unseal(token) {
  try {
    const buf = Buffer.from(String(token), "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", sealKey(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString());
  } catch {
    return null;
  }
}

export function readToken(req) {
  const raw = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !same(sign(payload), sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? { login: data.login, role: data.role } : null;
  } catch {
    return null;
  }
}
