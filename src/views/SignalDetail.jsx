import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import moment from "moment";
import { AlertCircle, Eye, EyeOff, FileUp, Loader2, Search, Settings, Trash2 } from "lucide-react";
import { signalAPI } from "@/api/signals";
import { MEDIUMS, WINDOWS, mediumAction, mediumLabel, outputLabel } from "@/lib/signalOptions";
import PlatformHeader from "@/components/signals/PlatformHeader";
import MediumIcon from "@/components/signals/MediumIcon";
import ShareButtons from "@/components/signals/ShareButtons";
import Footer from "@/components/podcast/Footer";

const ease = [0.16, 1, 0.3, 1];
const POLL_MS = 5000;

export default function SignalDetail() {
  const { slug } = useParams();
  const [signal, setSignal] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await signalAPI.get(slug);
      setSignal(data.signal);
      setItems(data.items || []);
      setError("");
    } catch (err) {
      setError(err.status === 404 ? "This collection does not exist." : err.message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const pending = items.some((item) => item.status === "queued" || item.status === "running");
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-alabaster flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-graphite/10 border-t-cobalt rounded-full animate-spin" />
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="min-h-screen bg-alabaster">
        <PlatformHeader />
        <p className="text-center font-mono text-[11px] tracking-widest uppercase text-graphite/40 py-32">{error}</p>
      </div>
    );
  }

  const c = signal.criteria || {};
  const criteriaBits = [
    c.keywords && `Keywords: ${c.keywords}`,
    c.topic_query && `Query: ${c.topic_query}`,
    c.require_nci && "NCI-supported",
    c.journals_only && "Flagship journals",
    c.require_outputs && "Shares data or code",
    WINDOWS.find((w) => w.id === c.window)?.label,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-alabaster">
      <PlatformHeader />

      <div className="max-w-5xl mx-auto px-6 md:px-16 pt-8 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease }}
          className="space-y-6"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-widest uppercase text-cobalt">
              <MediumIcon medium={signal.medium} className="w-3.5 h-3.5" /> {mediumLabel(signal.medium)} collection
            </span>
            <span className="font-mono text-[11px] text-graphite/40">by {signal.author.name}</span>
            {signal.visibility === "unlisted" && (
              <span className="px-2 py-0.5 rounded-full border border-graphite/15 font-mono text-[9px] tracking-widest uppercase text-graphite/40">
                Unlisted
              </span>
            )}
          </div>
          <h1 className="font-heading text-4xl md:text-6xl font-bold text-graphite italic leading-[1.1]">{signal.title}</h1>
          {signal.description && (
            <p className="font-body text-lg text-graphite/55 leading-relaxed max-w-3xl">{signal.description}</p>
          )}
          {criteriaBits.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {criteriaBits.map((bit) => (
                <span key={bit} className="px-3 py-1 rounded-full border border-graphite/10 font-mono text-[10px] tracking-wider text-graphite/50">
                  {bit}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <ShareButtons title={signal.title} path={`/signals/${signal.slug}`} />
            {signal.is_owner && (
              <Link
                to={`/signals/${signal.slug}/edit`}
                className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-graphite/50 hover:text-cobalt"
              >
                <Settings className="w-3.5 h-3.5" /> Edit collection
              </Link>
            )}
          </div>
        </motion.div>

        {signal.is_owner && <GeneratePanel signal={signal} onQueued={load} />}

        <section className="mt-16 space-y-6">
          <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-cobalt">
            {signal.is_owner ? "Your content" : "Content"} ({items.length})
          </p>
          {items.length === 0 ? (
            <p className="font-mono text-xs text-graphite/40 py-10">
              {signal.is_owner ? "Nothing here yet. Find a paper above or upload a PDF." : "Nothing published yet."}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} signal={signal} onChanged={load} />
              ))}
            </div>
          )}
        </section>
      </div>

      <Footer platform />
    </div>
  );
}

function GeneratePanel({ signal, onQueued }) {
  const [tab, setTab] = useState("find");
  const [medium, setMedium] = useState(signal.medium);
  const [windowId, setWindowId] = useState(signal.criteria?.window || "30d");
  const [candidates, setCandidates] = useState([]);
  const [meta, setMeta] = useState(null);
  const [searchState, setSearchState] = useState("idle");
  const [searchError, setSearchError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState({ tone: "", text: "" });
  const [pdfFile, setPdfFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadUrl, setUploadUrl] = useState("");
  const fileRef = useRef(null);

  async function search() {
    setSearchState("loading");
    setSearchError("");
    try {
      const data = await signalAPI.candidates(signal.slug, windowId);
      setCandidates(data.candidates || []);
      setMeta({ queried: data.queried, kept: data.kept, trending: data.trending_hits });
      setSearchState("ready");
    } catch (err) {
      setSearchError(err.message);
      setSearchState("error");
    }
  }

  async function queue(formData, key) {
    setBusyKey(key);
    setMessage({ tone: "", text: "" });
    formData.append("medium", medium);
    try {
      await signalAPI.generate(signal.slug, formData);
      setMessage({ tone: "ok", text: `Queued a ${mediumLabel(medium).toLowerCase()}. It will appear below when it is ready (usually a few minutes).` });
      await onQueued();
      return true;
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
      return false;
    } finally {
      setBusyKey("");
    }
  }

  async function generateFromCandidate(candidate) {
    const formData = new FormData();
    formData.append("paper", JSON.stringify({
      title: candidate.title,
      abstract: candidate.abstract,
      journal: candidate.journal,
      pmid: candidate.pmid,
      doi: candidate.doi,
      publication_url: candidate.publication_url,
      nci_grants: candidate.nci_grants,
      outputs: candidate.outputs,
      oa_pdf_url: candidate.oa_pdf_url,
    }));
    if (await queue(formData, candidate.pmid)) {
      setCandidates((list) => list.filter((c) => c.pmid !== candidate.pmid));
    }
  }

  async function generateFromUpload(e) {
    e.preventDefault();
    if (!pdfFile) {
      setMessage({ tone: "error", text: "Choose a PDF first" });
      return;
    }
    const formData = new FormData();
    formData.append("pdf", pdfFile);
    formData.append("paper", JSON.stringify({ title: uploadTitle, publication_url: uploadUrl }));
    if (await queue(formData, "upload")) {
      setPdfFile(null);
      setUploadTitle("");
      setUploadUrl("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="mt-14 rounded-2xl border border-graphite/10 bg-white p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-cobalt">Convert a paper</p>
          <p className="font-body text-sm text-graphite/50 mt-1">Convert one paper and add it to this collection.</p>
        </div>
        <label className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-widest uppercase text-graphite/40">Format</span>
          <select
            value={medium}
            onChange={(e) => setMedium(e.target.value)}
            className="font-mono text-xs uppercase tracking-widest bg-transparent border-b border-graphite/15 py-2 outline-none"
          >
            {MEDIUMS.map((m) => (
              <option key={m.id} value={m.id}>{m.action}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-6 border-b border-graphite/10" role="tablist">
        {[
          { id: "find", label: "Find papers", icon: Search },
          { id: "upload", label: "Upload a paper", icon: FileUp },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 pb-3 -mb-px border-b-2 font-mono text-xs uppercase tracking-widest transition-colors ${
              tab === id ? "border-cobalt text-cobalt" : "border-transparent text-graphite/40 hover:text-graphite"
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "find" ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-4">
            <select
              value={windowId}
              onChange={(e) => setWindowId(e.target.value)}
              className="font-mono text-xs uppercase tracking-widest bg-transparent border-b border-graphite/15 py-2 outline-none"
            >
              {WINDOWS.map((w) => (
                <option key={w.id} value={w.id}>{w.label}</option>
              ))}
            </select>
            <button
              onClick={search}
              disabled={searchState === "loading"}
              className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest bg-graphite text-white px-4 py-2 rounded-full hover:bg-graphite/90 disabled:opacity-50"
            >
              {searchState === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              {searchState === "loading" ? "Searching PubMed…" : "Find matching papers"}
            </button>
            {meta && (
              <span className="font-mono text-[11px] text-graphite/35">
                {meta.kept} matched · {meta.trending || 0} trending
              </span>
            )}
          </div>
          {searchError && <p className="font-mono text-xs text-red-500">{searchError}</p>}
          {searchState === "ready" && candidates.length === 0 && (
            <p className="font-mono text-xs text-graphite/40">No new papers match. Try a longer window or broader keywords.</p>
          )}
          <div className="space-y-3">
            {candidates.map((candidate) => (
              <div key={candidate.pmid} className="rounded-lg border border-graphite/10 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {typeof candidate.trending_rank === "number" && (
                    <span className="font-mono text-[10px] tracking-widest uppercase text-cobalt">Trending #{candidate.trending_rank}</span>
                  )}
                  {candidate.journal && (
                    <span className="font-mono text-[10px] tracking-widest uppercase text-graphite/40">{candidate.journal}</span>
                  )}
                  {candidate.pub_date && <span className="font-mono text-[10px] text-graphite/35">{candidate.pub_date}</span>}
                  {(candidate.outputs || []).map((o) => (
                    <a
                      key={`${o.type}-${o.id}`}
                      href={o.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-0.5 rounded-full border border-mint/30 font-mono text-[9px] uppercase tracking-wider text-mint hover:border-mint"
                    >
                      {outputLabel(o)}
                    </a>
                  ))}
                  <span className="font-mono text-[10px] text-graphite/35">{candidate.oa_pdf_url ? "Open-access PDF" : "Abstract only"}</span>
                </div>
                <p className="font-body text-sm text-graphite leading-snug">{candidate.title}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    onClick={() => generateFromCandidate(candidate)}
                    disabled={Boolean(busyKey)}
                    className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest bg-cobalt text-white px-4 py-2 rounded-full hover:bg-cobalt/90 disabled:opacity-50"
                  >
                    {busyKey === candidate.pmid && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {mediumAction(medium)}
                  </button>
                  <a href={candidate.pubmed_url} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] uppercase tracking-widest text-graphite/45 hover:text-cobalt">
                    PubMed
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={generateFromUpload} className="space-y-5">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
            className="w-full font-body text-sm text-graphite"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="Paper title (optional)"
              className="w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-body text-sm"
            />
            <input
              value={uploadUrl}
              onChange={(e) => setUploadUrl(e.target.value)}
              placeholder="Paper URL or DOI link (optional)"
              className="w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-body text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={Boolean(busyKey)}
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest bg-cobalt text-white px-5 py-2.5 rounded-full hover:bg-cobalt/90 disabled:opacity-50"
          >
            {busyKey === "upload" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {mediumAction(medium)} from PDF
          </button>
        </form>
      )}

      {message.text && (
        <p className={`font-mono text-xs ${message.tone === "error" ? "text-red-500" : "text-cobalt"}`}>{message.text}</p>
      )}
    </section>
  );
}

function ItemCard({ item, signal, onChanged }) {
  const [busy, setBusy] = useState(false);
  const ready = item.status === "completed";
  const statusText = {
    queued: "Queued",
    running: "Generating…",
    failed: "Failed",
  }[item.status];

  async function togglePublished() {
    setBusy(true);
    try {
      await signalAPI.setPublished(signal.slug, item.id, !item.published);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this from the collection?")) return;
    setBusy(true);
    try {
      await signalAPI.removeItem(signal.slug, item.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase text-cobalt">
          <MediumIcon medium={item.medium} className="w-3.5 h-3.5" /> {mediumLabel(item.medium)}
        </span>
        <span className="font-mono text-[10px] text-graphite/35">{moment(item.created_at).format("MMM D, YYYY")}</span>
        {item.duration && <span className="font-mono text-[10px] text-graphite/35">{item.duration}</span>}
        {statusText && (
          <span className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest ${item.status === "failed" ? "text-red-500" : "text-mint"}`}>
            {item.status === "failed" ? <AlertCircle className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
            {statusText}
          </span>
        )}
        {ready && !item.published && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-graphite/40">Hidden</span>
        )}
      </div>
      <h3 className="font-heading text-lg font-semibold text-graphite leading-snug group-hover:text-cobalt transition-colors">
        {ready ? item.title : item.paper_title || "Uploaded paper"}
      </h3>
      {ready && item.paper_title && item.paper_title !== item.title && (
        <p className="font-body text-xs text-graphite/45 mt-1 line-clamp-2">{item.paper_title}</p>
      )}
      {ready && item.description && (
        <p className="font-body text-sm text-graphite/55 mt-3 line-clamp-3">{item.description}</p>
      )}
      {item.status === "failed" && item.error && (
        <p className="font-mono text-[11px] text-red-500/80 mt-3 line-clamp-3">{item.error}</p>
      )}
      {!ready && signal.is_owner && (
        <p className="font-mono text-[10px] uppercase tracking-widest text-cobalt/70 mt-3">
          Open generation log
        </p>
      )}
    </>
  );

  const canOpen = ready || signal.is_owner;

  return (
    <div className="group rounded-xl border border-graphite/10 bg-white p-5 flex flex-col">
      {canOpen ? (
        <Link to={`/signals/${signal.slug}/items/${item.id}`} className="block focus:outline-none focus:ring-2 focus:ring-cobalt rounded">
          {body}
        </Link>
      ) : (
        <div>{body}</div>
      )}
      {signal.is_owner && (
        <div className="mt-auto pt-4 flex items-center gap-4">
          {ready && (
            <button
              onClick={togglePublished}
              disabled={busy}
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-graphite/40 hover:text-cobalt disabled:opacity-50"
            >
              {item.published ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {item.published ? "Hide" : "Show"}
            </button>
          )}
          <button
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-graphite/40 hover:text-red-500 disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
