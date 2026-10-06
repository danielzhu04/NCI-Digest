import { db } from "@/lib/database/index.js"
import { getCurrentUser } from "@/lib/auth/session.js"
import { dailyLimit, getSignal, itemsCreatedToday, listItems, serializeItem, usedPmids } from "@/lib/signals/store.js"
import { MEDIUM_IDS } from "@/lib/signalOptions.js"
import { queue_generate_signal_item } from "@/tasks/generateSignalItem.js"

const MAX_PDF_BYTES = 30 * 1024 * 1024

function parseJson(value, fallback) {
  if (!value || typeof value !== "string") return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

// Worker downloads this URL, so only allow public https hosts.
function safePdfUrl(value) {
  if (typeof value !== "string" || !value) return ""
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== "https:") return ""
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return ""
    if (/^[\d.]+$/.test(host) || host.includes(":")) return ""
    return url.toString()
  } catch {
    return ""
  }
}

export async function GET(request, { params }) {
  const { slug } = await params
  const user = await getCurrentUser()
  const row = await getSignal(slug)
    if (!row) return Response.json({ error: "Collection not found" }, { status: 404 })
  const isOwner = Boolean(user && user.id === row.owner_id)
  const items = await listItems(row.id, { includeHidden: isOwner })
  return Response.json({ items: items.map((item) => serializeItem(item, { includeLog: isOwner })) })
}

export async function POST(request, { params }) {
  const { slug } = await params
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 })

  const row = await getSignal(slug)
    if (!row) return Response.json({ error: "Collection not found" }, { status: 404 })
  if (row.owner_id !== user.id) return Response.json({ error: "Only the owner can generate here" }, { status: 403 })

  const limit = dailyLimit()
  if (await itemsCreatedToday(user.id) >= limit) {
    return Response.json({ error: `Daily limit reached (${limit} conversions per 24 hours)` }, { status: 429 })
  }

  let formData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 })
  }

  const medium = MEDIUM_IDS.includes(formData.get("medium")) ? formData.get("medium") : row.medium
  const rawPaper = parseJson(formData.get("paper"), {})
  const paper = {
    title: text(rawPaper.title, 500),
    abstract: text(rawPaper.abstract, 8000),
    journal: text(rawPaper.journal, 200),
    pmid: /^\d{1,10}$/.test(String(rawPaper.pmid || "")) ? String(rawPaper.pmid) : "",
    doi: text(rawPaper.doi, 200),
    publication_url: text(rawPaper.publication_url || formData.get("publication_url"), 500),
    nci_grants: Array.isArray(rawPaper.nci_grants) ? rawPaper.nci_grants.map(String).slice(0, 20) : [],
    outputs: Array.isArray(rawPaper.outputs)
      ? rawPaper.outputs
        .filter((o) => o && typeof o.type === "string" && typeof o.id === "string" && typeof o.url === "string")
        .slice(0, 24)
      : [],
  }

  let pdf_base64 = ""
  const pdfFile = formData.get("pdf")
  if (pdfFile && typeof pdfFile === "object" && pdfFile.size > 0) {
    if (pdfFile.size > MAX_PDF_BYTES) {
      return Response.json({ error: "PDF is larger than 30 MB" }, { status: 413 })
    }
    const buffer = Buffer.from(await pdfFile.arrayBuffer())
    if (buffer.subarray(0, 4).toString() !== "%PDF") {
      return Response.json({ error: "That file is not a PDF" }, { status: 400 })
    }
    pdf_base64 = buffer.toString("base64")
    if (!paper.title) paper.title = text(pdfFile.name?.replace(/\.pdf$/i, ""), 200)
  }

  const oa_pdf_url = pdf_base64 ? "" : safePdfUrl(rawPaper.oa_pdf_url)
  if (!pdf_base64 && !paper.abstract) {
    return Response.json({ error: "Upload a PDF or pick a paper with an abstract" }, { status: 400 })
  }

  if (paper.pmid && (await usedPmids(row.id)).includes(paper.pmid)) {
    return Response.json({ error: "This collection already has that paper" }, { status: 409 })
  }

  try {
    const item = await db
      .insertInto("app.signal_items")
      .values({
        signal_id: row.id,
        owner_id: user.id,
        status: "queued",
        medium,
        model: row.model,
        source: pdf_base64 ? "upload" : "pubmed",
        pmid: paper.pmid || null,
        doi: paper.doi || null,
        journal: paper.journal || null,
        publication_url: paper.publication_url || (paper.doi ? `https://doi.org/${paper.doi}` : null),
        paper_title: paper.title || null,
        paper: JSON.stringify({
          ...paper,
          abstract: undefined,
          generation_log: "Queued. Waiting for a worker to pick up this job.\n",
        }),
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    await queue_generate_signal_item({
      item_id: item.id,
      signal_slug: row.slug,
      signal_title: row.title,
      medium,
      model: row.model,
      structure_prompt: row.structure_prompt || "",
      paper,
      pdf_base64,
      oa_pdf_url,
    })

    return Response.json({ item: serializeItem(item) }, { status: 202 })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to queue generation" }, { status: 500 })
  }
}
