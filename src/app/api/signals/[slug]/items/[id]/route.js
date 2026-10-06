import { db } from "@/lib/database/index.js"
import { getCurrentUser } from "@/lib/auth/session.js"
import { enrichItemOutputs } from "@/lib/signals/outputs.js"
import { getItem, getSignal, serializeItem, serializeSignal } from "@/lib/signals/store.js"

async function load(slug, id) {
  const user = await getCurrentUser()
  const signal = await getSignal(slug)
  if (!signal) return { user, error: Response.json({ error: "Collection not found" }, { status: 404 }) }
  const item = await getItem(signal.id, id)
  const isOwner = Boolean(user && user.id === signal.owner_id)
  const visible = item && (isOwner || (item.status === "completed" && item.published))
  if (!visible) return { user, error: Response.json({ error: "Content not found" }, { status: 404 }) }
  return { user, signal, item, isOwner }
}

export async function GET(request, { params }) {
  const { slug, id } = await params
  const { user, signal, item, isOwner, error } = await load(slug, id)
  if (error) return error

  let row = item
  if (item.status === "completed") {
    try {
      const enriched = await enrichItemOutputs(item)
      if (!item.paper?.outputs_curated) {
        row = await db
          .updateTable("app.signal_items")
          .set({ paper: JSON.stringify(enriched.paper), updated_at: new Date() })
          .where("id", "=", item.id)
          .returningAll()
          .executeTakeFirstOrThrow()
      }
    } catch (e) {
      console.error("output enrich failed:", e)
    }
  }

  return Response.json({
    signal: serializeSignal(signal, user),
    item: serializeItem(row, { full: true, includeLog: isOwner }),
  })
}

export async function PATCH(request, { params }) {
  const { slug, id } = await params
  const { item, isOwner, error } = await load(slug, id)
  if (error) return error
  if (!isOwner) return Response.json({ error: "Only the owner can do that" }, { status: 403 })

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (typeof body.published !== "boolean") {
    return Response.json({ error: "Nothing to update" }, { status: 400 })
  }

  const updated = await db
    .updateTable("app.signal_items")
    .set({ published: body.published, updated_at: new Date() })
    .where("id", "=", item.id)
    .returningAll()
    .executeTakeFirstOrThrow()
  return Response.json({ item: serializeItem(updated, { full: true, includeLog: true }) })
}

export async function DELETE(request, { params }) {
  const { slug, id } = await params
  const { item, isOwner, error } = await load(slug, id)
  if (error) return error
  if (!isOwner) return Response.json({ error: "Only the owner can do that" }, { status: 403 })
  await db.deleteFrom("app.signal_items").where("id", "=", item.id).execute()
  return Response.json({ deleted: item.id })
}
