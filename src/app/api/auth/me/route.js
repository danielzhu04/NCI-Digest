import { devLoginEnabled, getCurrentUser, googleConfigured, publicUser } from "@/lib/auth/session.js"

export async function GET() {
  const providers = { google: googleConfigured(), dev: devLoginEnabled() }
  try {
    const user = await getCurrentUser()
    return Response.json({ user: publicUser(user), providers })
  } catch (e) {
    console.error(e)
    return Response.json({ user: null, providers, error: "Could not load session" }, { status: 500 })
  }
}
