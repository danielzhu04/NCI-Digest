import { cookies } from "next/headers"
import python from '../../../../utils/python.js'

export async function GET(request) {
  const cookieStore = await cookies()
  const authenticated = cookieStore.get("admin_authenticated")

  if (!authenticated) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const window = searchParams.get("window") || ""
  const limit = Number(searchParams.get("limit") || 10)
  const feed = searchParams.get("feed") || ""
  const topic_query = searchParams.get("topic") || ""
  const require_nci = searchParams.get("nci") !== "0"

  try {
    const result = feed
      ? await python("tasks.feeds.run_feed", {
          kargs: [],
          kwargs: { slug: feed, window, limit },
        })
      : await python("tasks.paperFinder.find_candidates", {
          kargs: [],
          kwargs: { window: window || "7d", limit, topic_query, require_nci },
        })
    return Response.json(result)
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to find paper candidates" }, { status: 500 })
  }
}
