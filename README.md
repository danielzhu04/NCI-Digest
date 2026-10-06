# NCI Digest

**From trending cancer paper to reusable data in minutes. NCI Digest closes the gap between discovering a paper and reusing what it shared.**

![NCI Data Sharing Impact Prize – Track 1 Prototype](https://img.shields.io/badge/NCI%20Data%20Sharing%20Impact%20Prize-Track%201%20Prototype-0b5394?style=for-the-badge)
![Status: Working prototype](https://img.shields.io/badge/status-working%20prototype-2e7d32?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791?style=flat-square&logo=postgresql&logoColor=white)
![Python](https://img.shields.io/badge/Python-3-3776ab?style=flat-square&logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed?style=flat-square&logo=docker&logoColor=white)

**Live prototype:** <https://nci-signal.k8s.maayanlab.cloud/>
**Flagship collection:** [NCI Signal](https://nci-signal.k8s.maayanlab.cloud/nci-signal), a weekly AI podcast on the NCI-supported paper that drew the most PubMed attention.

### Why NCI Digest?

- **Shared data is hard to find from the paper.** NCI-funded papers deposit data, code, and tools in GEO, GDC, GitHub, and other repositories, but the accessions are buried in availability statements and supplements, and most readers never follow them.
- **Busy researchers and clinicians don't have time to read every paper.** A short, accurate explainer they can listen to or skim gets the work in front of people who would otherwise skip it.
- **Each explainer ends with the reusable outputs.** Every item links straight to the datasets, code, and tools the paper shared, so learning about the work leads directly to reusing it.

---

## Table of Contents

- [Overview & Core Features](#overview--core-features)
- [System Architecture & Pipeline](#system-architecture--pipeline)
- [Formats & Content Types](#formats--content-types)
- [Tech Stack](#tech-stack)
- [Quick Start (Local Development)](#quick-start-local-development)
- [Using the Platform](#using-the-platform)
- [Alignment with FAIR Principles & NCI ODS Goals](#alignment-with-fair-principles--nci-ods-goals)
- [License](#license)
- [Roadmap](#roadmap)

---

## Overview & Core Features

The project has two layers:

| | What it is |
|---|---|
| **NCI Signal** | The flagship, curated weekly collection maintained by the Ma'ayan Lab: the most-discussed NCI-funded paper each week, reviewed before publication. |
| **NCI Digest** | The community platform. Signed-in users create and share their own collections, defined by topic, date window, or a raw PubMed query. |

Core features:

- **Automated PubMed Trending ingestion.** Searches PubMed for papers with **NCI grant support** in a rolling date window, intersects them with the **PubMed Trending** list (~1,000 PMIDs), and ranks by trending position. **OpenAlex** adds citation counts and open-access PDF locations, with **PubMed Central** as a fallback. Users can also **upload their own PDF**.
- **Multi-repository output mining (20+ repositories).** Scans the title, abstract, full-text PDF (including the data-availability pages at the end), and **Europe PMC data links** for accessions and URLs across **GEO, SRA, BioProject, dbGaP, ArrayExpress, PRIDE, GDC, IDC, PDC, CRDC, GitHub, GitLab, Hugging Face, Zenodo, Figshare, Dryad, OSF, protocols.io, Bioconductor, PDB, BioStudies, and MetaboLights**.
- **Strictly source-grounded generation.** Every prompt is wrapped in fixed **source rules**: the paper (PDF or abstract) is the only factual source, and the model may not invent findings, numbers, quotations, datasets, or accessions. Creator instructions cannot override these rules. When only an abstract is available, the item is shorter and says so on the page.
- **Four explainer formats.** Podcast, TED-style talk, slide deck with speaker notes, and narrated video (slides played in sync with an AI voice-over).
- **Custom user collections.** Users choose the format, model, a **structure prompt**, keywords, an optional PubMed query, a date window (7/14/30/90 days), and filters for NCI-only, flagship journals, or papers that share data or code.
- **Human-in-the-loop review.** Flagship NCI Signal episodes are saved as **unpublished drafts** and must be edited and approved in the Admin dashboard before release. Collection owners can hide or publish any item they generate.
- **Shareable by default.** Each item page has X, LinkedIn, and copy-link sharing with server-rendered link previews.

---

## System Architecture & Pipeline

```text
 ┌───────────────────────────────┐
 │ 1. PAPER INGESTION            │  PubMed E-utilities (NCI grant filter, date window)
 │    PubMed / OpenAlex          │  ∩ PubMed Trending  →  ranked candidates
 │                               │  + OpenAlex / PMC open-access PDFs, or user PDF upload
 └───────────────┬───────────────┘
                 ▼
 ┌───────────────────────────────┐
 │ 2. OUTPUT EXTRACTION          │  Regex scan of title, abstract, PDF text
 │    20+ repos (GEO/GDC/GitHub) │  + Europe PMC data links  →  deduplicated, ranked outputs
 └───────────────┬───────────────┘
                 ▼
 ┌───────────────────────────────┐
 │ 3. GROUNDED LLM PROMPTING     │  Source rules + format spec + creator structure prompt
 │    script / slides / notes    │  → strict JSON contract  →  TTS audio (podcast, talk, video)
 └───────────────┬───────────────┘
                 ▼
 ┌───────────────────────────────┐
 │ 4. DRAFT REVIEW               │  Flagship: unpublished draft → Admin edit & approve
 │    human in the loop          │  Community: owner can hide or publish each item
 └───────────────┬───────────────┘
                 ▼
 ┌───────────────────────────────┐
 │ 5. NCI DIGEST PLATFORM        │  Next.js gallery, collection & item pages,
 │    publish & share            │  "Reuse this work" links to every extracted output
 └───────────────────────────────┘

 Runtime: Next.js app ──enqueue──▶ PostgreSQL (Graphile Worker queue) ──▶ Node worker ──▶ Python tasks
          Audio → S3-compatible storage  ·  Slides, metadata, users → PostgreSQL
```

### Step-by-step

1. **Paper ingestion** ([`src/tasks/paperFinder.py`](src/tasks/paperFinder.py), [`src/tasks/signalPapers.py`](src/tasks/signalPapers.py))
   Builds a PubMed query from the collection's criteria (NCI grant terms, keywords, optional raw query, date window, journal filter), then scrapes the PubMed Trending page because it has no JSON API. Candidates are ranked by trending position, with a bonus for papers that share outputs. OpenAlex supplies the open-access PDF URL; otherwise the PMC PDF is tried.

2. **Output extraction** ([`src/tasks/reusableOutputs.py`](src/tasks/reusableOutputs.py))
   Pattern-matches accession formats (`GSE…`, `phs…`, `PXD…`, `E-MTAB-…`, `PRJNA…`) and repository URLs (`github.com/…`, `portal.gdc.cancer.gov/…`, `imaging.datacommons.cancer.gov/…`, Zenodo/Figshare/Dryad DOIs). It reads the first and last pages of the PDF, where data-availability statements usually are, and merges in Europe PMC data links. Results are normalized to HTTPS, deduplicated, ranked by repository type, and capped at 24 per paper.

3. **Grounded LLM prompting** ([`src/tasks/signalGenerator.py`](src/tasks/signalGenerator.py), [`src/tasks/scriptPrompts.py`](src/tasks/scriptPrompts.py))
   The prompt is assembled from three fixed parts: **source rules**, a **per-format specification**, and a **JSON response contract**. The creator's structure prompt sits inside these and cannot override them. Extracted PDF text is preferred over the abstract. If generation from the full text times out, it retries from the abstract and marks the item as abstract-based. Spoken formats are voiced with TTS ([`src/tasks/audioGenerator.py`](src/tasks/audioGenerator.py)).

4. **Draft review** ([`src/views/Admin.jsx`](src/views/Admin.jsx), [`src/tasks/generatePodcast.py`](src/tasks/generatePodcast.py))
   Flagship episodes are added to the catalog as `published: false`. An admin edits the title, description, and script, then publishes. Community items can be hidden or shown by their owner through `PATCH /api/signals/:slug/items/:id`.

5. **Platform** ([`src/app`](src/app), [`src/views`](src/views))
   Next.js App Router pages and API routes serve the community gallery (`/`), the flagship collection (`/nci-signal`), user collections, and item pages. Each item page ends with the extracted reusable outputs.

---

## Formats & Content Types

| Format | What you get | Ideal use case |
|---|---|---|
| 🎧 **Podcast** | Two AI hosts (Trinity and Axiom) discuss the paper: question, approach, key findings, limits, and what can be reused. | Commutes, workouts, staying current without screen time |
| 🎤 **TED-style talk** | One narrator, one big idea, told as a story arc that ends with a single takeaway. | Clinical breaks, quick context before a tumor board or seminar |
| 📊 **Slides** | A short deck (problem, approach, results, limits, shared outputs, takeaway) with speaker notes. | Lab meetings, journal clubs, teaching |
| 🎬 **Narrated video** | Slides played in sync with an AI voice-over, one scene per idea. | Onboarding trainees, outreach, social sharing |

Every format ends by pointing to the paper's **data, code, and tools**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web app & API | [Next.js](https://nextjs.org/) 16 (App Router), React 18, Tailwind CSS, Radix UI |
| Database | [PostgreSQL](https://www.postgresql.org/) 17 via [Kysely](https://kysely.dev/) (type-safe queries and migrations) |
| Job queue | [Graphile Worker](https://worker.graphile.org/), a PostgreSQL-backed queue |
| Pipeline | Python 3 (PubMed, OpenAlex, Europe PMC, `pypdf`, OpenAI SDK, Gemini REST API) |
| Storage | S3-compatible object storage, accessed with `rclone` |
| Auth | Google OAuth with signed session cookies; email-only dev login for local testing |
| Deployment | Docker (`Dockerfile.app`, `Dockerfile.worker`) and Docker Compose, deployed to the Ma'ayan Lab Kubernetes cluster |
| External APIs | PubMed E-utilities, PubMed Trending, OpenAlex, Europe PMC, iCite |

**Models.** Generation is **provider-agnostic**. The same source rules and JSON contract are sent to whichever model a collection uses:

| Provider | Models | Used for | Key |
|---|---|---|---|
| **OpenAI** | `gpt-5.5-2026-04-23` (default), plus anything in `SIGNAL_MODELS` | Scripts, slides, and all text-to-speech (`gpt-4o-mini-tts`) | `OPENAI_API_KEY` |
| **Google Gemini** | `gemini-2.5-flash` (override with `GEMINI_MODEL`) | Scripts and slides, from full-text PDFs or abstracts | `GEMINI_API_KEY` |

When `GEMINI_API_KEY` is set, the Gemini model appears in the collection editor's **Model** picker, so each collection owner can switch between providers. Set `SIGNAL_DEFAULT_MODEL=gemini-2.5-flash` to make Gemini the default for new collections. Any model whose name starts with `gemini` is sent to the Gemini API, and every other model goes to OpenAI. With the **Gemini free tier**, the **Slides** format runs at no cost. Spoken formats still use OpenAI for text-to-speech.

---

## Quick Start (Local Development)

### Prerequisites

- [Docker](https://www.docker.com/) with Docker Compose
- [Node.js](https://nodejs.org/) 20 or newer, with npm
- Python 3.10 or newer
- [`rclone`](https://rclone.org/) (only needed to upload audio to S3)
- An `OPENAI_API_KEY`, a [`GEMINI_API_KEY`](https://aistudio.google.com/apikey), or both

### 1. Clone and configure

```bash
git clone https://github.com/danielzhu04/NCI-podcast.git
cd NCI-podcast
cp .env.example .env
```

Edit `.env` and set at least:

```bash
POSTGRES_PASSWORD=choose-a-password
DATABASE_URL=postgres://postgres:choose-a-password@localhost:5432/postgres
OPENAI_API_KEY=sk-...          # scripts with OpenAI models, and all audio
GEMINI_API_KEY=...             # optional: adds gemini-2.5-flash to the model picker
SESSION_SECRET=a-long-random-string
ADMIN_PASSWORD=pick-a-local-password
ALLOW_DEV_LOGIN=true           # email-only sign-in, no Google OAuth needed locally
```

**Zero-cost setup:** get a free key from [Google AI Studio](https://aistudio.google.com/apikey), set `GEMINI_API_KEY` and `SIGNAL_DEFAULT_MODEL=gemini-2.5-flash`, and create a **Slides** collection. Script and deck generation then runs on the Gemini free tier, with no OpenAI key needed.

### 2. Start PostgreSQL

```bash
docker compose up -d nci-signal-postgres
```

### 3. Install dependencies and migrate

```bash
npm install

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

npx kysely migrate:latest
```

### 4. Run the app and the worker

```bash
npm run dev       # Next.js on http://localhost:3000
```

In a second terminal:

```bash
source .venv/bin/activate
npm run worker    # Graphile Worker: runs generation jobs
```

Generation runs in the worker, so both processes must be running.

### Running the full stack in Docker

`docker-compose.yaml` defines three services: `nci-signal-app`, `nci-signal-worker`, and `nci-signal-postgres`. To build and run everything in containers:

```bash
docker compose up -d --build
```

### Environment reference

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `OPENAI_API_KEY` | For OpenAI models and audio | Script generation with OpenAI models, and all TTS |
| `GEMINI_API_KEY` | Optional | Adds the Gemini model to the picker and enables Gemini generation |
| `GEMINI_MODEL` | Optional | Gemini model to offer (default `gemini-2.5-flash`) |
| `SIGNAL_DEFAULT_MODEL` | Optional | Default model for new collections (default `gpt-5.5-2026-04-23`) |
| `SESSION_SECRET` | ✅ | Signs user session cookies |
| `ADMIN_PASSWORD` | ✅ | Admin dashboard login at `/admin` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Production | Google sign-in. Register `<origin>/api/auth/google/callback` as the redirect URI. |
| `ALLOW_DEV_LOGIN` | Local only | Email-only sign-in. Ignored in production builds. |
| `SIGNAL_MODELS` | Optional | Extra selectable models, comma-separated |
| `SIGNAL_DAILY_LIMIT` | Optional | Generations per user per 24 hours (default `5`) |
| `NCI_SCRIPT_PROMPT` | Optional | Flagship prompt set: `v1_paper_discussion` or `v2_ted_talk` |
| `RCLONE_CONFIG_MAAYANLAB_*`, `S3_*` | For audio | S3-compatible storage for generated audio |

---

## Using the Platform

- **Browse.** `/` is the community gallery, with NCI Signal pinned first at `/nci-signal`.
- **Create a collection.** Sign in, go to `/signals/new`, and choose a format, model, structure prompt, paper criteria, and visibility (public or unlisted).
- **Generate.** On the collection page, search matching papers (ranked by PubMed Trending) or upload a PDF, then generate. Audio is stored in S3 under `nci-signal/signals/<slug>/`, and slides are stored in PostgreSQL.
- **Review the flagship.** `/admin` lists flagship drafts to edit and publish.
- **Scoped feeds.** Save a PubMed topic as a candidate feed from the Admin page or the command line:

```bash
npm run feed -- list
npm run feed -- add --name "Pancreatic cancer" \
  --topic 'pancreatic neoplasms[mh] OR "pancreatic cancer"[tiab]'
npm run feed -- run pancreatic-cancer --limit 10
```

Add `--no-nci` to drop the NCI-grant requirement for a feed.

---

## Alignment with FAIR Principles & NCI ODS Goals

NCI's data-sharing policy has made cancer research outputs **Findable** and **Accessible**: they are deposited in GDC, IDC, PDC, GEO, dbGaP, and GitHub. Reuse still depends on a researcher noticing the accession, often buried in a data-availability statement. NCI Digest puts those deposits in front of the reader **at the moment they are learning about the paper**, so a dataset that is findable in principle becomes one they actually open.

| FAIR principle | How NCI Digest supports it |
|---|---|
| **Findable** | Accessions are extracted from full text and Europe PMC data links and shown on every item, so outputs are discoverable from the paper itself. |
| **Accessible** | Each output links directly to its repository landing page (GDC, IDC, GEO, dbGaP, GitHub, and others) over HTTPS. |
| **Interoperable** | Outputs are normalized to a common `{type, id, url}` record across 20+ repositories, ready for downstream indexing or cross-linking. |
| **Reusable** | Each explainer covers methods and limitations and ends with "what you could reuse," giving readers the context needed to judge whether the data fit their question. |

This supports the NCI **Office of Data Sharing (ODS)** goal of measurable secondary use of NCI-funded data. It makes outputs from **CRDC** resources (GDC, IDC, PDC) visible to clinicians, trainees, and researchers in neighboring fields who might never search those portals directly.

---

## License

This project is intended to be released under the **[MIT License](https://opensource.org/licenses/MIT)**. A `LICENSE` file will be added to the repository root. Generated explainers summarize published research. Rights to the source papers and deposited datasets stay with their authors and repositories.

---

## Roadmap

- **Fully zero-cost audio:** add Gemini text-to-speech so podcast, talk, and video formats also run on the free tier.
- **Gemini for the flagship:** route the weekly NCI Signal episode (currently OpenAI only) through the same model switch.
- **Altmetric API integration:** add Altmetric attention scores to PubMed Trending when ranking papers. A connector already exists but is currently disabled.
- **Section 508 accessibility:** auto-generated captions and transcripts for audio and video, and accessible slide exports.
- **CRDC webinar cross-linking:** link extracted GDC, IDC, and PDC outputs to related CRDC webinars, tutorials, and workspace notebooks.
- **Reuse analytics:** track click-throughs from explainers to repositories as a measure of data-sharing impact.

---

<sub>Built by the [Ma'ayan Lab](https://labs.icahn.mssm.edu/maayanlab/) at the Icahn School of Medicine at Mount Sinai. Submitted as supplementary evidence for the NCI Data Sharing Impact Prize, Track 1: Ideas.</sub>
