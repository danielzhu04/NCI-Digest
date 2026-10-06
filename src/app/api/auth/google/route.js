import crypto from "crypto"
import { NextResponse } from "next/server"
import { OAUTH_STATE_COOKIE, googleConfigured, requestOrigin, safeNextPath } from "@/lib/auth/session.js"

export async function GET(request) {
  if (!googleConfigured()) {
    return Response.json({ error: "Google sign-in is not configured" }, { status: 503 })
  }

  const origin = requestOrigin(request)
  const next = safeNextPath(new URL(request.url).searchParams.get("next"))
  const state = crypto.randomBytes(24).toString("base64url")

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  })

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  response.cookies.set(OAUTH_STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  })
  return response
}
