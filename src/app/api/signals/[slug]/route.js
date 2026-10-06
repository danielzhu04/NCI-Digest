import { getCurrentUser } from "@/lib/auth/session.js"
import {
  SignalInput,
  deleteSignal,
  firstIssue,
  getSignal,
  listItems,
  serializeItem,
  serializeSignal,
  updateSignal,
} from "@/lib/signals/store.js"

export async function GET(request, { params }) {
  const { slug } = await params
  try {
    const user = await getCurrentUser()
    const row = await getSignal(slug)
    if (!row) return Response.json({ error: "Collection not found" }, { status: 404 })
    const isOwner = Boolean(user && user.id === row.owner_id)
    const items = await listItems(row.id, { includeHidden: isOwner })
    return Response.json({
      signal: serializeSignal(row, user),
      items: items.map((item) => serializeItem(item, { includeLog: isOwner })),
    })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to load collection" }, { status: 500 })
  }
}

async function ownedSignal(slug) {
  const user = await getCurrentUser()
  if (!user) return { error: Response.json({ error: "Sign in first" }, { status: 401 }) }
  const row = await getSignal(slug)
  if (!row) return { error: Response.json({ error: "Collection not found" }, { status: 404 }) }
  if (row.owner_id !== user.id) return { error: Response.json({ error: "Only the owner can do that" }, { status: 403 }) }
  return { user, row }
}

export async function PATCH(request, { params }) {
  const { slug } = await params
  const { user, row, error } = await ownedSignal(slug)
  if (error) return error

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = SignalInput.safeParse(body)
  if (!parsed.success) return Response.json({ error: firstIssue(parsed.error) }, { status: 400 })

  try {
    await updateSignal(row.id, parsed.data)
    return Response.json({ signal: serializeSignal(await getSignal(slug), user) })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to save collection" }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const { slug } = await params
  const { row, error } = await ownedSignal(slug)
  if (error) return error
  try {
    await deleteSignal(row.id)
    return Response.json({ deleted: slug })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to delete collection" }, { status: 500 })
  }
}
