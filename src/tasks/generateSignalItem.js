import { db } from '../lib/database/index.js'
import python, { ProcessError } from '../utils/python.js'
import graphile from '../lib/graphile/index.js'
import { sql } from 'kysely'
import { z } from 'zod'

const PaperInput = z.looseObject({
  title: z.string().optional().default(""),
  abstract: z.string().optional().default(""),
  journal: z.string().optional().default(""),
  pmid: z.string().optional().default(""),
  doi: z.string().optional().default(""),
  publication_url: z.string().optional().default(""),
  nci_grants: z.array(z.string()).optional().default([]),
  outputs: z.array(z.object({
    type: z.string(),
    id: z.string(),
    url: z.string(),
  })).optional().default([]),
})

const SignalItemPayload = z.object({
  item_id: z.string(),
  signal_slug: z.string(),
  signal_title: z.string(),
  medium: z.string(),
  model: z.string(),
  structure_prompt: z.string().optional().default(""),
  paper: PaperInput.optional().default({}),
  pdf_base64: z.string().optional().default(""),
  oa_pdf_url: z.string().optional().default(""),
})

const LOG_MAX = 24000

function createItemLogger(itemId) {
  let buf = ""
  let pending = ""
  let timer = null
  let writing = Promise.resolve()

  function flush(extra = "") {
    if (extra) pending += extra
    if (!pending) return writing
    buf = (buf + pending).slice(-LOG_MAX)
    pending = ""
    writing = writing
      .then(() => db
        .updateTable("app.signal_items")
        .set({
          paper: sql`jsonb_set(coalesce(paper, '{}'::jsonb), '{generation_log}', to_jsonb(${buf}::text), true)`,
          updated_at: new Date(),
        })
        .where("id", "=", itemId)
        .execute())
      .catch((err) => console.error("generation log flush failed", err))
    return writing
  }

  return {
    snapshot: () => (buf + pending).slice(-LOG_MAX),
    write(text, { raw = false } = {}) {
      pending += raw ? String(text) : `${String(text).replace(/\s+$/, "")}\n`
      if (!timer) timer = setTimeout(() => { timer = null; flush() }, 400)
    },
    async end(text) {
      if (timer) clearTimeout(timer)
      timer = null
      await flush(text || "")
    },
  }
}

export async function queue_generate_signal_item(payload) {
  const input = SignalItemPayload.parse(payload)
  const workerUtils = await graphile
  await workerUtils.addJob('generate_signal_item', input, { maxAttempts: 1 })
}

export default async function generateSignalItem(rawProps, helpers) {
  const props = SignalItemPayload.parse(rawProps)
  const logger = createItemLogger(props.item_id)
  const started = Date.now()

  const item = await db
    .selectFrom('app.signal_items')
    .select(['id', 'status', 'paper'])
    .where('id', '=', props.item_id)
    .executeTakeFirst()

  if (!item || item.status === 'completed') return

  await db.updateTable('app.signal_items')
    .set({ status: 'running', error: null, updated_at: new Date() })
    .where('id', '=', item.id)
    .execute()

  logger.write(`Worker picked up job (${props.medium}, ${props.model || "default model"})`)
  const heartbeat = setInterval(() => {
    logger.write(`still running (${Math.round((Date.now() - started) / 1000)}s) — last Python line is the current step`)
  }, 30000)

  try {
    helpers.abortSignal?.throwIfAborted()
    logger.write("Starting Python generate_item")

    const result = await python('tasks.signalGenerator.generate_item', {
      kargs: [],
      kwargs: {
        item_id: props.item_id,
        signal_slug: props.signal_slug,
        signal_title: props.signal_title,
        medium: props.medium,
        model: props.model,
        structure_prompt: props.structure_prompt,
        paper: props.paper,
        pdf_base64: props.pdf_base64,
        oa_pdf_url: props.oa_pdf_url,
      },
    }, (chunk) => logger.write(chunk, { raw: true }))

    logger.write("Python finished. Saving item.")
    await logger.end()

    const paper = {
      ...(item.paper && typeof item.paper === 'object' ? item.paper : {}),
      ...props.paper,
      outputs: result.outputs || props.paper.outputs || [],
      outputs_curated: true,
      generation_log: logger.snapshot(),
    }
    delete paper.abstract

    await db.updateTable('app.signal_items')
      .set({
        status: 'completed',
        title: result.title,
        paper_title: result.paper_title || props.paper.title || null,
        description: result.description,
        tags: JSON.stringify(result.tags || []),
        content: JSON.stringify(result.content || {}),
        paper: JSON.stringify(paper),
        media_url: result.media_url || null,
        duration: result.duration || null,
        source: result.source,
        error: null,
        updated_at: new Date(),
      })
      .where('id', '=', item.id)
      .execute()
  } catch (e) {
    console.error(e)
    const message = e instanceof ProcessError ? e.message : String(e)
    logger.write(`ERROR: ${message}`)
    await logger.end()
    await db.updateTable('app.signal_items')
      .set({
        status: 'failed',
        error: message,
        updated_at: new Date(),
      })
      .where('id', '=', item.id)
      .execute()
  } finally {
    clearInterval(heartbeat)
  }
}
