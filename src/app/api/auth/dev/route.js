import { NextResponse } from "next/server"
import {
  SESSION_COOKIE,
  devLoginEnabled,
  encodeSession,
  publicUser,
  sessionCookieOptions,
  upsertUser,
} from "@/lib/auth/session.js"

// Local testing only: ALLOW_DEV_LOGIN=true and not a production build.
export async function POST(request) {
  if (!devLoginEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = String(body.email || "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email" }, { status: 400 })
  }

  const user = await upsertUser({
    email,
    name: String(body.name || "").trim() || null,
    provider: "dev",
  })
  const response = NextResponse.json({ user: publicUser(user) })
  response.cookies.set(SESSION_COOKIE, encodeSession(user.id), sessionCookieOptions())
  return response
}
