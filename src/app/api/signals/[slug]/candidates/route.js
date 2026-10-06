import { getCurrentUser } from "@/lib/auth/session.js"
import { getSignal, usedPmids } from "@/lib/signals/store.js"
import { WINDOW_IDS } from "@/lib/signalOptions.js"
import python from "@/utils/python.js"

export async function GET(request, { params }) {
  const { slug } = await params
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 })

  const row = await getSignal(slug)
  if (!row) return Response.json({ error: "Collection not found" }, { status: 404 })
  if (row.owner_id !== user.id) return Response.json({ error: "Only the owner can search papers" }, { status: 403 })

  const searchParams = new URL(request.url).searchParams
  const windowParam = searchParams.get("window") || ""
  const window = WINDOW_IDS.includes(windowParam) ? windowParam : ""

  try {
    const result = await python("tasks.signalPapers.find_signal_candidates", {
      kargs: [],
      kwargs: {
        criteria: row.criteria || {},
        exclude_pmids: await usedPmids(row.id),
        window,
        limit: 10,
      },
    })
    return Response.json(result)
  } catch (e) {
    console.error(e)
    const message = typeof e?.message === "string" && e.message.startsWith("Add keywords")
      ? e.message
      : "Failed to find papers for this collection"
    return Response.json({ error: message }, { status: 500 })
  }
}
