import { cookies } from "next/headers"
import python from '../../../utils/python.js'

async function requireAdmin() {
  const cookieStore = await cookies()
  return Boolean(cookieStore.get("admin_authenticated"))
}

export async function GET() {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await python("tasks.feeds.list_feeds", { kargs: [], kwargs: {} })
    return Response.json(result)
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to list feeds" }, { status: 500 })
  }
}

export async function POST(request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const result = await python("tasks.feeds.upsert_feed", {
      kargs: [],
      kwargs: {
        name: body.name || "",
        slug: body.slug || "",
        topic_query: body.topic_query || "",
        require_nci: body.require_nci !== false,
        window: body.window || "7d",
        prompt: body.prompt || "",
        catalog_prefix: body.catalog_prefix || "",
      },
    })
    return Response.json(result)
  } catch (e) {
    console.error(e)
    const message = typeof e?.message === "string" ? e.message : "Failed to save feed"
    return Response.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const slug = searchParams.get("slug") || ""
  if (!slug) {
    return Response.json({ error: "Missing feed slug" }, { status: 400 })
  }

  try {
    const result = await python("tasks.feeds.delete_feed", {
      kargs: [],
      kwargs: { slug },
    })
    return Response.json(result)
  } catch (e) {
    console.error(e)
    const message = typeof e?.message === "string" ? e.message : "Failed to delete feed"
    return Response.json({ error: message }, { status: 400 })
  }
}
