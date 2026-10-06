import '../../index.css'
import { ClientOnly } from './client'
import { getItem, getSignal } from '@/lib/signals/store.js'
import { FLAGSHIP_SIGNAL, mediumLabel } from '@/lib/signalOptions.js'

export const dynamic = 'force-dynamic'

function preview(title, description) {
  return {
    title,
    description,
    openGraph: { title, description, siteName: 'NCI Digest' },
    twitter: { card: 'summary', title, description },
  }
}

export async function generateMetadata({ params }) {
  const { slug = [] } = await params
  try {
    if (slug[0] === FLAGSHIP_SIGNAL.slug || slug[0] === 'episode' || slug[0] === 'archive') {
      return preview('NCI Signal — This week in NCI-supported cancer research', FLAGSHIP_SIGNAL.description)
    }
    if (slug[0] === 'signals' && slug[1] && slug[1] !== 'new') {
      const signal = await getSignal(slug[1])
      if (!signal) return {}
      if (slug[2] === 'items' && slug[3]) {
        const item = await getItem(signal.id, slug[3])
        if (item && item.status === 'completed' && item.published) {
          return preview(
            `${item.title} · ${signal.title}`,
            item.description || `${mediumLabel(item.medium)} on ${item.paper_title || 'a cancer research paper'}`,
          )
        }
      }
      return preview(`${signal.title} · NCI Digest`, signal.description || `A paper collection by ${signal.author_name || 'a researcher'}`)
    }
  } catch (e) {
    console.error('generateMetadata failed:', e)
  }
  return {}
}

export default function Page() {
  return <ClientOnly />
}
