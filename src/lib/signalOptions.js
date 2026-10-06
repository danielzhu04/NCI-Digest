export const MEDIUMS = [
  {
    id: "podcast",
    label: "Podcast",
    action: "Paper → Podcast",
    blurb: "Two AI hosts, Trinity and Axiom, talk through the paper.",
    defaultStructure:
      "Open with a real-world hook, then have Trinity explain the question and approach while Axiom asks what a curious listener would ask. Spend most of the time on the two or three findings that matter, give the limits their own stretch, and end with what a listener could reuse from the paper's data or code.",
  },
  {
    id: "ted_talk",
    label: "TED-style talk",
    action: "Paper → TED talk",
    blurb: "One narrator, one big idea, a story arc.",
    defaultStructure:
      "Hook with a vivid question or image. State the one big idea in plain English. Give just enough background, walk through the researchers' logic as a series of decisions, land the key discovery, be honest about the limits, then return to the opening image and leave one memorable takeaway.",
  },
  {
    id: "slides",
    label: "Slides",
    action: "Paper → Slides",
    blurb: "A short deck with speaker notes.",
    defaultStructure:
      "Title slide, the problem, why it matters, the approach, two to three key results (one per slide), limitations, what was shared for reuse (data, code, tools), and a final takeaway slide.",
  },
  {
    id: "video",
    label: "Narrated video",
    action: "Paper → Video",
    blurb: "Slides with an AI voice-over, played in sync.",
    defaultStructure:
      "Scene 1 hooks the viewer, scene 2 states the question, then walk through approach and findings one scene at a time, give a scene to limits, and close with how a viewer could use the paper's outputs.",
  },
]

export const MEDIUM_IDS = MEDIUMS.map((m) => m.id)

export const WINDOWS = [
  { id: "7d", label: "Last 7 days" },
  { id: "14d", label: "Last 14 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
]

export const WINDOW_IDS = WINDOWS.map((w) => w.id)

export const DEFAULT_CRITERIA = {
  keywords: "",
  topic_query: "",
  require_nci: true,
  window: "30d",
  journals_only: false,
  require_outputs: false,
}

export function mediumLabel(id) {
  return MEDIUMS.find((m) => m.id === id)?.label || id
}

export function mediumAction(id) {
  return MEDIUMS.find((m) => m.id === id)?.action || mediumLabel(id)
}

export function contentCount(n) {
  const count = Number(n) || 0
  return `${count} item${count === 1 ? "" : "s"}`
}

const OUTPUT_LABELS = {
  geo: "GEO",
  sra: "SRA",
  dbgap: "dbGaP",
  github: "GitHub",
  gitlab: "GitLab",
  zenodo: "Zenodo",
  figshare: "Figshare",
  dryad: "Dryad",
  osf: "OSF",
  huggingface: "Hugging Face",
  arrayexpress: "ArrayExpress",
  pride: "PRIDE",
  bioproject: "BioProject",
  gdc: "GDC",
  idc: "IDC",
  pdc: "PDC",
  crdc: "CRDC",
  protocols: "protocols.io",
  bioconductor: "Bioconductor",
  pdb: "PDB",
  biostudies: "BioStudies",
  metabolights: "MetaboLights",
}

export function outputLabel(output) {
  const kind = OUTPUT_LABELS[output?.type] || output?.type || "Resource"
  const raw = String(output?.id || "").replace(/^(github|gitlab|huggingface)\.com\//i, "")
  const id = raw.length > 36 ? `${raw.slice(0, 34)}…` : raw
  return id ? `${kind} ${id}` : kind
}

export const FLAGSHIP_SIGNAL = {
  slug: "nci-signal",
  href: "/nci-signal",
  title: "NCI Signal",
  description:
    "A weekly AI podcast on the NCI-supported cancer paper that drew the most PubMed attention, plus the data, code, and tools it left behind.",
  medium: "podcast",
  author: { name: "Ma'ayan Lab" },
  image_url: "https://s3.k8s.maayanlab.cloud/axiom-podcasts/logo.png?v=2",
  featured: true,
}
