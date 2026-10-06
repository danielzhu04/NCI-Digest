# NCI Signal (Full-Stack)
## Development
The app on this branch uses [Next.js](https://nextjs.org/), a framework for developing the server and client side of a web application via React.
Additionally, we use [Kysely](https://kysely.dev/), a type-safe API for making SQL database queries, for communicating with our PostgreSQL database.
[PostgreSQL](https://www.postgresql.org/) stores application data, including podcast episode information and the state of background jobs.
For asynchronous podcast generation, the application uses the [Graphile Worker](https://worker.graphile.org/) to manage a PostgreSQL-backed job queue.

## Deployment
The full-stack web app was deployed to the Ma'ayan Lab of Computational Systems Biology's dev cluster at https://nci-signal.k8s.maayanlab.cloud/ 

## Getting Started in Local Development

```python

cp .env.example .env
#Create the local environment file

docker compose up -d
#Start the Postgres database

npm install
#Install dependencies

python3 -m venv .venv
source .venv/bin/activate
#Create a python virtual environment

pip install -r requirements.txt
#Install python requirements

npx kysely migrate:latest
#Initialize the PostgreSQL database with Kysely migrations

npm run dev
#Start the Next.js web app

npm run worker
#In another terminal run the Graphile Worker

```

## NCI Digest

`/` is the NCI Digest platform. Its community gallery lists every public collection, with the flagship
NCI Signal podcast (by the Ma'ayan Lab) pinned first at `/nci-signal`. Old `/archive` and `/episode/:id`
links redirect there.

A signed-in user can create a collection at `/signals/new`:

- format: podcast, TED-style talk, slides, or narrated video (the default; each generation can pick another)
- model, from `gpt-5.5-2026-04-23` plus anything in `SIGNAL_MODELS`
- a structure prompt describing how the content should be laid out
- paper criteria: keywords, an optional raw PubMed query, date window, NCI-only, flagship journals only,
  must share data or code
- public (listed in the gallery) or unlisted

On the collection page the owner can search matching papers (PubMed, ranked by PubMed Trending) or upload a
PDF, then generate. Generation runs in the Graphile worker (`generate_signal_item`), so `npm run worker`
must be running. If a searched paper has no open-access PDF, the item is generated from the abstract and
labelled that way. Audio goes to S3 under `nci-signal/signals/<slug>/`; slides are stored in Postgres.
Every item page has X, LinkedIn, and copy-link sharing, with server-rendered link previews.

Sign-in uses Google OAuth. Set `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`, and
register `<origin>/api/auth/google/callback` as a redirect URI (add each ngrok host you use). For local
testing without Google, set `ALLOW_DEV_LOGIN=true` to get an email-only sign-in form.

Run `npx kysely migrate:latest` after pulling; this adds the `app.users`, `app.signals`, and
`app.signal_items` tables.

## Scoped feeds

The Admin page can save a PubMed topic as a scoped candidate feed. Candidate
searches do not generate audio; a paper still has to be selected and submitted.

The same workflow is available from the command line:

```bash
npm run feed -- list
npm run feed -- add --name "Pancreatic cancer" \
  --topic 'pancreatic neoplasms[mh] OR "pancreatic cancer"[tiab]'
npm run feed -- run pancreatic-cancer --limit 10
```

Add `--no-nci` when a feed should not require an NCI grant. The flagship feed
keeps the existing NCI-only search and `nci-signal/manifest.json` catalog.
