import crypto from "crypto"
import { cookies } from "next/headers"
import { db } from "../database/index.js"

export const SESSION_COOKIE = "nci_session"
export const OAUTH_STATE_COOKIE = "nci_oauth_state"
const SESSION_MAX_AGE = 60 * 60 * 24 * 30

let warnedDevSecret = false

function secret() {
  const value = process.env.SESSION_SECRET || process.env.ADMIN_SESSION_SECRET
  if (value) return value
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production")
  }
  if (!warnedDevSecret) {
    console.warn("SESSION_SECRET is not set; using an insecure development secret")
    warnedDevSecret = true
  }
  return "nci-signal-dev-session-secret"
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url")
}

export function encodeSession(userId) {
  const payload = Buffer.from(JSON.stringify({
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  })).toString("base64url")
  return `${payload}.${sign(payload)}`
}

export function decodeSession(token) {
  if (!token || typeof token !== "string") return null
  const [payload, signature] = token.split(".")
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!data.uid || typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null
    return data
  } catch {
    return null
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  }
}

export function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name || user.email.split("@")[0],
    avatar_url: user.avatar_url || "",
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value)
  if (!session) return null
  const user = await db
    .selectFrom("app.users")
    .select(["id", "email", "name", "avatar_url"])
    .where("id", "=", session.uid)
    .executeTakeFirst()
  return user || null
}

export async function upsertUser({ email, name, avatar_url, provider }) {
  const normalized = String(email || "").trim().toLowerCase()
  if (!normalized) throw new Error("Missing email")
  return await db
    .insertInto("app.users")
    .values({ email: normalized, name: name || null, avatar_url: avatar_url || null, provider })
    .onConflict((oc) => oc.column("email").doUpdateSet((eb) => ({
      name: eb.fn.coalesce(eb.ref("excluded.name"), eb.ref("app.users.name")),
      avatar_url: eb.fn.coalesce(eb.ref("excluded.avatar_url"), eb.ref("app.users.avatar_url")),
      last_login_at: new Date(),
    })))
    .returning(["id", "email", "name", "avatar_url"])
    .executeTakeFirstOrThrow()
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function devLoginEnabled() {
  return process.env.ALLOW_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production"
}

export function requestOrigin(request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "")
  const headers = request.headers
  const host = headers.get("x-forwarded-host") || headers.get("host")
  const proto = headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "")
  return `${proto}://${host}`
}

export function safeNextPath(value) {
  const next = typeof value === "string" ? value : ""
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/api/") ? next : "/"
}
