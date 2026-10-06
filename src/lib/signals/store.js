import crypto from "crypto"
import { sql } from "kysely"
import { z } from "zod"
import { db } from "../database/index.js"
import { DEFAULT_CRITERIA, MEDIUM_IDS, WINDOW_IDS } from "../signalOptions.js"

export const DEFAULT_MODEL = process.env.SIGNAL_DEFAULT_MODEL || "gpt-5.5-2026-04-23"
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"
const RESERVED_SLUGS = new Set(["new", "options", "nci-signal", "flagship", "admin", "api"])

export function allowedModels() {
  const extra = (process.env.SIGNAL_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
  const gemini = process.env.GEMINI_API_KEY ? [GEMINI_MODEL] : []
  return [...new Set([DEFAULT_MODEL, ...gemini, ...extra])]
}

export function dailyLimit() {
  const value = Number(process.env.SIGNAL_DAILY_LIMIT || 5)
  return Number.isFinite(value) && value > 0 ? value : 5
}

const Criteria = z.object({
  keywords: z.string().max(500).optional().default(""),
  topic_query: z.string().max(1000).optional().default(""),
  require_nci: z.boolean().optional().default(true),
  window: z.enum(WINDOW_IDS).optional().default(DEFAULT_CRITERIA.window),
  journals_only: z.boolean().optional().default(false),
  require_outputs: z.boolean().optional().default(false),
})

export const SignalInput = z.object({
  title: z.string().trim().min(3, "Give your collection a title").max(80),
  description: z.string().trim().max(600).optional().default(""),
  medium: z.enum(MEDIUM_IDS),
  model: z.string().trim().optional().default(DEFAULT_MODEL),
  structure_prompt: z.string().trim().max(4000).optional().default(""),
  criteria: Criteria.optional().default(DEFAULT_CRITERIA),
  visibility: z.enum(["public", "unlisted"]).optional().default("public"),
}).superRefine((value, ctx) => {
  if (!allowedModels().includes(value.model)) {
    ctx.addIssue({ code: "custom", path: ["model"], message: "That model is not available" })
  }
  const c = value.criteria
  if (!c.require_nci && !c.keywords.trim() && !c.topic_query.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["criteria"],
      message: "Add keywords or a PubMed query, or keep the NCI grant filter on",
    })
  }
})

export function firstIssue(error) {
  return error?.issues?.[0]?.message || "Invalid input"
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "signal"
}

async function uniqueSlug(title) {
  const base = slugify(title)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 && !RESERVED_SLUGS.has(base)
      ? base
      : `${base.slice(0, 41)}-${crypto.randomBytes(3).toString("hex")}`
    const taken = await db.selectFrom("app.signals").select("id").where("slug", "=", slug).executeTakeFirst()
    if (!taken) return slug
  }
  throw new Error("Could not create a unique link for this collection")
}

export function serializeSignal(row, viewer) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || "",
    medium: row.medium,
    model: row.model,
    structure_prompt: row.structure_prompt || "",
    criteria: { ...DEFAULT_CRITERIA, ...(row.criteria || {}) },
    visibility: row.visibility,
    author: { name: row.author_name || (row.author_email || "").split("@")[0], avatar_url: row.author_avatar || "" },
    item_count: Number(row.item_count || 0),
    latest_item_at: row.latest_item_at || null,
    cover: row.cover_title ? { title: row.cover_title, medium: row.cover_medium } : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_owner: Boolean(viewer && viewer.id === row.owner_id),
  }
}

function paperObject(row) {
  return row.paper && typeof row.paper === "object" && !Array.isArray(row.paper) ? row.paper : {}
}

export function serializeItem(row, { full = false, includeLog = false } = {}) {
  const paper = paperObject(row)
  const item = {
    id: row.id,
    signal_id: row.signal_id,
    status: row.status,
    medium: row.medium,
    model: row.model,
    source: row.source || "",
    pmid: row.pmid || "",
    doi: row.doi || "",
    journal: row.journal || "",
    publication_url: row.publication_url || "",
    paper_title: row.paper_title || "",
    title: row.title || row.paper_title || "Untitled",
    description: row.description || "",
    tags: row.tags || [],
    media_url: row.media_url || "",
    duration: row.duration || "",
    error: row.error || "",
    published: row.published,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
  if (includeLog) item.log = String(paper.generation_log || "")
  if (full) {
    item.content = row.content || null
    item.paper = includeLog ? paper : Object.fromEntries(
      Object.entries(paper).filter(([key]) => key !== "generation_log"),
    )
  }
  return item
}

function signalQuery() {
  return db
    .selectFrom("app.signals as s")
    .innerJoin("app.users as u", "u.id", "s.owner_id")
    .select([
      "s.id", "s.owner_id", "s.slug", "s.title", "s.description", "s.medium", "s.model",
      "s.structure_prompt", "s.criteria", "s.visibility", "s.created_at", "s.updated_at",
      "u.name as author_name", "u.email as author_email", "u.avatar_url as author_avatar",
    ])
    .select((eb) => [
      eb.selectFrom("app.signal_items as i")
        .select(eb.fn.countAll().as("n"))
        .whereRef("i.signal_id", "=", "s.id")
        .where("i.status", "=", "completed")
        .where("i.published", "=", true)
        .as("item_count"),
      eb.selectFrom("app.signal_items as i")
        .select(eb.fn.max("i.created_at").as("m"))
        .whereRef("i.signal_id", "=", "s.id")
        .where("i.status", "=", "completed")
        .where("i.published", "=", true)
        .as("latest_item_at"),
      eb.selectFrom("app.signal_items as i")
        .select("i.title")
        .whereRef("i.signal_id", "=", "s.id")
        .where("i.status", "=", "completed")
        .where("i.published", "=", true)
        .orderBy("i.created_at", "desc")
        .limit(1)
        .as("cover_title"),
      eb.selectFrom("app.signal_items as i")
        .select("i.medium")
        .whereRef("i.signal_id", "=", "s.id")
        .where("i.status", "=", "completed")
        .where("i.published", "=", true)
        .orderBy("i.created_at", "desc")
        .limit(1)
        .as("cover_medium"),
    ])
}

export async function listPublicSignals() {
  return await signalQuery()
    .where("s.visibility", "=", "public")
    .orderBy(sql`coalesce((select max(created_at) from app.signal_items where signal_id = s.id and status = 'completed' and published), s.created_at)`, "desc")
    .limit(200)
    .execute()
}

export async function listSignalsFor(userId) {
  return await signalQuery()
    .where("s.owner_id", "=", userId)
    .orderBy("s.updated_at", "desc")
    .execute()
}

export async function getSignal(slug) {
  return await signalQuery().where("s.slug", "=", slug).executeTakeFirst()
}

export async function createSignal(ownerId, input) {
  const slug = await uniqueSlug(input.title)
  const row = await db
    .insertInto("app.signals")
    .values({
      owner_id: ownerId,
      slug,
      title: input.title,
      description: input.description,
      medium: input.medium,
      model: input.model,
      structure_prompt: input.structure_prompt,
      criteria: JSON.stringify(input.criteria),
      visibility: input.visibility,
    })
    .returning("slug")
    .executeTakeFirstOrThrow()
  return await getSignal(row.slug)
}

export async function updateSignal(signalId, input) {
  await db
    .updateTable("app.signals")
    .set({
      title: input.title,
      description: input.description,
      medium: input.medium,
      model: input.model,
      structure_prompt: input.structure_prompt,
      criteria: JSON.stringify(input.criteria),
      visibility: input.visibility,
      updated_at: new Date(),
    })
    .where("id", "=", signalId)
    .execute()
}

export async function deleteSignal(signalId) {
  await db.deleteFrom("app.signals").where("id", "=", signalId).execute()
}

export async function listItems(signalId, { includeHidden = false } = {}) {
  let query = db
    .selectFrom("app.signal_items")
    .selectAll()
    .where("signal_id", "=", signalId)
    .orderBy("created_at", "desc")
  if (!includeHidden) {
    query = query.where("status", "=", "completed").where("published", "=", true)
  }
  return await query.execute()
}

export async function getItem(signalId, itemId) {
  if (!z.uuid().safeParse(itemId).success) return null
  return await db
    .selectFrom("app.signal_items")
    .selectAll()
    .where("signal_id", "=", signalId)
    .where("id", "=", itemId)
    .executeTakeFirst()
}

export async function usedPmids(signalId) {
  const rows = await db
    .selectFrom("app.signal_items")
    .select("pmid")
    .where("signal_id", "=", signalId)
    .where("pmid", "is not", null)
    .where("pmid", "!=", "")
    .where("status", "!=", "failed")
    .execute()
  return rows.map((r) => r.pmid)
}

export async function itemsCreatedToday(ownerId) {
  const row = await db
    .selectFrom("app.signal_items")
    .select((eb) => eb.fn.countAll().as("n"))
    .where("owner_id", "=", ownerId)
    .where("created_at", ">", sql`now() - interval '24 hours'`)
    .executeTakeFirst()
  return Number(row?.n || 0)
}
