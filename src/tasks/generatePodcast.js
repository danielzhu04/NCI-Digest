import { db } from '../lib/database/index.js'
import python, { ProcessError } from '../utils/python.js'
import graphile from '../lib/graphile/index.js'
import { z } from 'zod'

const PodcastJobInput = z.object({
  pdf_base64: z.string(),
  publication_url: z.string(),
  tool_url: z.string(),
  image_url: z.string(),
  prompt_name: z.string().optional().default(""),
  pmid: z.string().optional().default(""),
  doi: z.string().optional().default(""),
  journal: z.string().optional().default(""),
  nci_grants: z.array(z.string()).optional().default([]),
  impact: z.looseObject({
    lane: z.string().optional().nullable(),
    rcr: z.number().optional().nullable(),
    trending_rank: z.number().optional().nullable(),
    reason: z.string().optional().nullable(),
  }).optional().default({}),
  outputs: z.array(z.object({
    type: z.string(),
    id: z.string(),
    url: z.string(),
  })).optional().default([]),
})

export async function queue_generate_podcast(props) {
  const input = PodcastJobInput.parse(props)
  const job = await db.insertInto('app.podcast_jobs')
    .values({
      user_id: props.user_id,
      publication_url: input.publication_url,
      tool_url: input.tool_url,
      image_url: input.image_url,
      status: 'queued',
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const workerUtils = await graphile
  await workerUtils.addJob('generate_podcast', { podcast_job_id: job.id, ...input })

  return job.id
}

const GeneratePodcastPayload = z.object({
  podcast_job_id: z.string(),
}).and(PodcastJobInput)

export default async function generatePodcast(rawProps, helpers) {
  const props = GeneratePodcastPayload.parse(rawProps)

  const job = await db
    .selectFrom('app.podcast_jobs')
    .select(['id', 'status', 'result_url'])
    .where('id', '=', props.podcast_job_id)
    .executeTakeFirst()

  if (!job) return
  if (job.status === 'completed' && job.result_url) return

  await db.updateTable('app.podcast_jobs')
    .set({ status: 'running', error: null, updated_at: new Date() })
    .where('id', '=', job.id)
    .execute()

  try {
    helpers.abortSignal?.throwIfAborted()

    const podcastUrl = await python('tasks.generatePodcast.generate', {
      kargs: [],
      kwargs: {
        pdf_base64: props.pdf_base64,
        publication_url: props.publication_url,
        tool_url: props.tool_url,
        image_url: props.image_url,
        prompt_name: props.prompt_name,
        pmid: props.pmid,
        doi: props.doi,
        journal: props.journal,
        nci_grants: props.nci_grants,
        impact: props.impact,
        outputs: props.outputs,
      },
    })

    await db.updateTable('app.podcast_jobs')
      .set({ status: 'completed', result_url: podcastUrl, error: null, updated_at: new Date() })
      .where('id', '=', job.id)
      .execute()
  } catch (e) {
    console.error(e)
    await db.updateTable('app.podcast_jobs')
      .set({
        status: 'failed',
        error: e instanceof ProcessError ? e.message : String(e),
        updated_at: new Date(),
      })
      .where('id', '=', job.id)
      .execute()
  }
}
