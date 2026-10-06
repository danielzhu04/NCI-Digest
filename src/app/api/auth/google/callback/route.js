import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  encodeSession,
  googleConfigured,
  requestOrigin,
  safeNextPath,
  sessionCookieOptions,
  upsertUser,
} from "@/lib/auth/session.js"

function fail(origin, reason) {
  const response = NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`)
  response.cookies.delete(OAUTH_STATE_COOKIE)
  return response
}

export async function GET(request) {
  const origin = requestOrigin(request)
  if (!googleConfigured()) return fail(origin, "google_not_configured")

  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  const cookieStore = await cookies()
  let saved = null
  try {
    saved = JSON.parse(cookieStore.get(OAUTH_STATE_COOKIE)?.value || "null")
  } catch {
    saved = null
  }
  if (!code || !state || !saved || saved.state !== state) return fail(origin, "invalid_state")

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok || !tokens.access_token) return fail(origin, "token_exchange_failed")

    const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const profile = await profileRes.json()
    if (!profileRes.ok || !profile.email || profile.email_verified === false) {
      return fail(origin, "email_not_verified")
    }

    const user = await upsertUser({
      email: profile.email,
      name: profile.name,
      avatar_url: profile.picture,
      provider: "google",
    })

    const response = NextResponse.redirect(`${origin}${safeNextPath(saved.next)}`)
    response.cookies.set(SESSION_COOKIE, encodeSession(user.id), sessionCookieOptions())
    response.cookies.delete(OAUTH_STATE_COOKIE)
    return response
  } catch (e) {
    console.error(e)
    return fail(origin, "sign_in_failed")
  }
}
