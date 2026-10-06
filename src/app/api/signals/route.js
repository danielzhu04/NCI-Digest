import { getCurrentUser } from "@/lib/auth/session.js"
import {
  SignalInput,
  createSignal,
  firstIssue,
  listPublicSignals,
  listSignalsFor,
  serializeSignal,
} from "@/lib/signals/store.js"

export async function GET(request) {
  const mine = new URL(request.url).searchParams.get("mine") === "1"
  try {
    const user = await getCurrentUser()
    if (mine) {
      if (!user) return Response.json({ error: "Sign in to see your collections" }, { status: 401 })
      const rows = await listSignalsFor(user.id)
      return Response.json({ signals: rows.map((row) => serializeSignal(row, user)) })
    }
    const rows = await listPublicSignals()
    return Response.json({ signals: rows.map((row) => serializeSignal(row, user)) })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to load collections" }, { status: 500 })
  }
}

export async function POST(request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: "Sign in to create a collection" }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = SignalInput.safeParse(body)
  if (!parsed.success) return Response.json({ error: firstIssue(parsed.error) }, { status: 400 })

  try {
    const row = await createSignal(user.id, parsed.data)
    return Response.json({ signal: serializeSignal(row, user) }, { status: 201 })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to create collection" }, { status: 500 })
  }
}
