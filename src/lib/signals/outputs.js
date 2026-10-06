const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

const PATTERNS = [
  [/\b(GSE\d+)\b/gi, "geo", (id) => `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${id}`],
  [/\b(GDS\d+)\b/gi, "geo", (id) => `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${id}`],
  [/\b(SR[PRXS]\d+)\b/gi, "sra", (id) => `https://www.ncbi.nlm.nih.gov/sra/?term=${id}`],
  [/\b(PRJ[NED][A-Z]\d+)\b/gi, "bioproject", (id) => `https://www.ncbi.nlm.nih.gov/bioproject/${id}`],
  [/\b(phs\d+(?:\.\w+)*)\b/gi, "dbgap", (id) => `https://www.ncbi.nlm.nih.gov/projects/gap/cgi-bin/study.cgi?study_id=${id}`],
  [/\b(E-(?:MTAB|GEOD|MEXP|TABM)-\d+)\b/gi, "arrayexpress", (id) => `https://www.ebi.ac.uk/arrayexpress/experiments/${id}`],
  [/\b(PXD\d+)\b/gi, "pride", (id) => `https://www.ebi.ac.uk/pride/archive/projects/${id}`],
  [/(github\.com\/[\w.\-]+\/[\w.\-]+)/gi, "github", (id) => `https://${id}`],
  [/(gitlab\.com\/[\w.\-]+\/[\w.\-]+)/gi, "gitlab", (id) => `https://${id}`],
  [/(huggingface\.co\/[\w.\-]+\/[\w.\-]+)/gi, "huggingface", (id) => `https://${id}`],
  [/(10\.5281\/zenodo\.\d+)/gi, "zenodo", (id) => `https://doi.org/${id}`],
  [/(10\.6084\/m9\.figshare\.\S+)/gi, "figshare", (id) => `https://doi.org/${id}`],
  [/(10\.5061\/dryad\.\S+)/gi, "dryad", (id) => `https://doi.org/${id}`],
  [/(osf\.io\/[a-z0-9]{5,})\b/gi, "osf", (id) => `https://${id}`],
]

function cleanId(value) {
  return String(value || "").replace(/[.,;:)\]]+$/g, "").trim()
}

export function mergeOutputs(...groups) {
  const seen = new Set()
  const found = []
  for (const group of groups) {
    for (const item of group || []) {
      const type = String(item?.type || "").toLowerCase()
      const id = cleanId(item?.id)
      const url = String(item?.url || "").replace(/^http:\/\//i, "https://")
      if (!type || !id || !url.startsWith("https://")) continue
      const key = `${type}:${id.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ type, id, url })
    }
  }
  return found.slice(0, 24)
}

export function findOutputs(text) {
  const found = []
  const blob = text || ""
  for (const [pattern, type, toUrl] of PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(blob))) {
      const id = cleanId(match[1])
      if (id) found.push({ type, id, url: toUrl(id) })
    }
  }
  return mergeOutputs(found)
}

function ncbiParams(extra) {
  const params = new URLSearchParams({
    tool: process.env.NCBI_TOOL || "nci-signal",
    email: process.env.NCBI_EMAIL || "nci-signal@example.org",
    ...extra,
  })
  if (process.env.NCBI_API_KEY) params.set("api_key", process.env.NCBI_API_KEY)
  return params.toString()
}

async function ncbiJson(path, extra) {
  const response = await fetch(`${EUTILS}/${path}?${ncbiParams(extra)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) return null
  return response.json()
}

async function elinkIds(pmid, db) {
  const payload = await ncbiJson("elink.fcgi", { dbfrom: "pubmed", db, id: pmid, retmode: "json" })
  const uids = []
  for (const linkset of payload?.linksets || []) {
    for (const group of linkset.linksetdbs || []) {
      for (const uid of group.links || []) {
        if (uid) uids.push(String(uid))
      }
    }
  }
  return [...new Set(uids)]
}

async function esummaryAccessions(uids, db) {
  if (!uids.length) return {}
  const payload = await ncbiJson("esummary.fcgi", { db, id: uids.slice(0, 40).join(","), retmode: "json" })
  const result = payload?.result || {}
  const accessions = {}
  for (const uid of uids) {
    const row = result[uid] || {}
    const acc = String(row.accession || row.Accession || row.accn || row.caption || "").trim()
    if (acc) accessions[uid] = acc
  }
  return accessions
}

export async function pubmedLinkedOutputs(pmid) {
  if (!/^\d{1,10}$/.test(String(pmid || ""))) return []
  try {
    const [gdsIds, sraIds] = await Promise.all([elinkIds(pmid, "gds"), elinkIds(pmid, "sra")])
    const [gds, sra] = await Promise.all([esummaryAccessions(gdsIds, "gds"), esummaryAccessions(sraIds, "sra")])
    const found = []
    for (const acc of Object.values(gds)) {
      found.push({ type: "geo", id: acc, url: `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${acc}` })
    }
    for (const acc of Object.values(sra)) {
      found.push({ type: "sra", id: acc, url: `https://www.ncbi.nlm.nih.gov/sra/?term=${acc}` })
    }
    return mergeOutputs(found)
  } catch {
    return []
  }
}

export async function enrichItemOutputs(item) {
  const paper = item?.paper && typeof item.paper === "object" ? item.paper : {}
  if (paper.outputs_curated) return { outputs: mergeOutputs(paper.outputs), paper, changed: false }
  const text = [item.paper_title, paper.title, item.title].filter(Boolean).join(" ")
  const outputs = mergeOutputs(paper.outputs, findOutputs(text), await pubmedLinkedOutputs(item.pmid))
  return {
    outputs,
    paper: { ...paper, outputs, outputs_curated: true },
    changed: JSON.stringify(outputs) !== JSON.stringify(paper.outputs || []),
  }
}
