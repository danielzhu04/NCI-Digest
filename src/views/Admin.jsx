import React, { useState, useEffect } from "react";
import { episodeAPI } from "@/api/episodes";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Footer from "@/components/podcast/Footer";
import { motion } from "framer-motion";

const ease = [0.16, 1, 0.3, 1];

export default function Admin() {
  const [pdfFile, setPdfFile] = useState(null);
  const [pendingEpisodes, setPendingEpisodes] = useState([]);
  const [publishedEpisodes, setPublishedEpisodes] = useState([]);
  const [form, setForm] = useState({
    publication_url: "",
    tool_url: "",
    image_url: "",
  });
  const [paperMeta, setPaperMeta] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [candidateMeta, setCandidateMeta] = useState(null);
  const [candidateStatus, setCandidateStatus] = useState("idle");
  const [candidateError, setCandidateError] = useState("");
  const [windowDays, setWindowDays] = useState("7d");
  const [feeds, setFeeds] = useState([]);
  const [feedPrompts, setFeedPrompts] = useState(["v2_ted_talk"]);
  const [feedSlug, setFeedSlug] = useState("flagship");
  const [newFeed, setNewFeed] = useState({
    name: "",
    topic_query: "",
    require_nci: true,
    prompt: "v2_ted_talk",
  });
  const [feedBusy, setFeedBusy] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  async function login() {
    setAuthError("");
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) setAuthenticated(true);
    else setAuthError("Wrong password");
  }

  async function fetchEpisodes() {
    try {
      const episodes = await episodeAPI.list();
      setPendingEpisodes(episodes.filter((ep) => ep.published === false));
      setPublishedEpisodes(episodes.filter((ep) => ep.published !== false));
    } catch (err) {
      console.error("fetchEpisodes failed:", err);
    }
  }

  async function fetchCandidates() {
    setCandidateStatus("loading");
    setCandidateError("");
    try {
      const params = new URLSearchParams({
        window: windowDays,
        limit: "10",
        feed: feedSlug || "flagship",
      });
      const res = await fetch(`/api/papers/candidates?${params}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load candidates");
      }
      setCandidates(data.candidates || []);
      setCandidateMeta({
        queried: data.queried,
        kept: data.kept,
        window: data.window,
        attention_source: data.attention_source,
        trending_listed: data.trending_listed,
        trending_hits: data.trending_hits,
        require_nci: data.require_nci !== false,
        topic_query: data.topic_query || "",
        feed: data.feed || null,
      });
      setCandidateStatus("ready");
    } catch (err) {
      console.error(err);
      setCandidateError(err.message || "Failed to load candidates");
      setCandidateStatus("error");
    }
  }

  async function fetchFeeds() {
    setFeedError("");
    try {
      const res = await fetch("/api/feeds", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load feeds");
      }
      setFeeds(data.feeds || []);
      setFeedPrompts(data.prompts || ["v2_ted_talk"]);
    } catch (err) {
      setFeedError(err.message || "Failed to load feeds");
    }
  }

  async function saveFeed() {
    if (!newFeed.name.trim() || !newFeed.topic_query.trim()) {
      setFeedError("Name and PubMed topic are required for a scoped feed");
      return;
    }
    setFeedBusy(true);
    setFeedError("");
    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFeed.name.trim(),
          topic_query: newFeed.topic_query.trim(),
          require_nci: newFeed.require_nci,
          window: windowDays,
          prompt: newFeed.prompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save feed");
      }
      setNewFeed({
        name: "",
        topic_query: "",
        require_nci: true,
        prompt: "v2_ted_talk",
      });
      await fetchFeeds();
      if (data.feed?.slug) {
        setFeedSlug(data.feed.slug);
      }
    } catch (err) {
      setFeedError(err.message || "Failed to save feed");
    } finally {
      setFeedBusy(false);
    }
  }

  async function removeFeed(slug) {
    setFeedBusy(true);
    setFeedError("");
    try {
      const res = await fetch(`/api/feeds?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete feed");
      }
      setFeeds(data.feeds || []);
      if (feedSlug === slug) {
        setFeedSlug("flagship");
      }
    } catch (err) {
      setFeedError(err.message || "Failed to delete feed");
    } finally {
      setFeedBusy(false);
    }
  }

  useEffect(() => {
    if (authenticated) {
      fetchEpisodes();
      fetchFeeds();
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) {
      fetchCandidates();
    }
  }, [authenticated, feedSlug]);

  function handleChange(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function usePaper(candidate) {
    setPaperMeta(candidate);
    setForm({
      publication_url: candidate.publication_url || candidate.pubmed_url || "",
      tool_url: candidate.tool_url || "",
      image_url: candidate.image_url || "",
    });
    setMessage("");

    if (!candidate.oa_pdf_url) {
      setStatus("idle");
      return;
    }

    setStatus("submitting");
    setMessage("Trying to fetch an open-access PDF…");
    try {
      const res = await fetch(`/api/papers/oa-pdf?url=${encodeURIComponent(candidate.oa_pdf_url)}`);
      if (!res.ok) {
        throw new Error("Open-access PDF was not available");
      }
      const blob = await res.blob();
      const file = new File([blob], `${candidate.pmid || "paper"}.pdf`, { type: "application/pdf" });
      setPdfFile(file);
      setStatus("success");
      setMessage("Open-access PDF attached. You can still replace it with a manual upload.");
    } catch {
      setPdfFile(null);
      setStatus("idle");
      setMessage("No open-access PDF. Upload the paper PDF below.");
    }
  }

  async function handleSubmit() {
    if (!pdfFile) {
      setStatus("error");
      setMessage("Please select a PDF file");
      return;
    }

    setStatus("submitting");
    setMessage("");

    const formData = new FormData();
    formData.append("pdf", pdfFile);
    formData.append("publication_url", form.publication_url);
    formData.append("tool_url", form.tool_url);
    formData.append("image_url", form.image_url);
    formData.append("pmid", paperMeta?.pmid || "");
    formData.append("doi", paperMeta?.doi || "");
    formData.append("journal", paperMeta?.journal || "");
    formData.append("nci_grants", JSON.stringify(paperMeta?.nci_grants || []));
    formData.append("impact", JSON.stringify(paperMeta?.impact || {}));
    formData.append("outputs", JSON.stringify(paperMeta?.outputs || []));
    formData.append("prompt_name", candidateMeta?.feed?.prompt || "");

    try {
      const res = await fetch("/api/podcasts/generate", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(typeof data.error === "string" ? data.error : "Failed to queue job");
        return;
      }

      setStatus("success");
      setMessage(`Queued. Job id: ${data.job_id}`);
      setPdfFile(null);
      setPaperMeta(null);
      setForm({ publication_url: "", tool_url: "", image_url: "" });
    } catch (e) {
      setStatus("error");
      setMessage("Network error — could not reach the server");
    }
  }

  const isSubmitting = status === "submitting";
  const selectedFeed = feeds.find((feed) => feed.slug === feedSlug) || null;

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-alabaster flex items-center justify-center">
        <div className="max-w-sm w-full px-6 space-y-4">
          <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-cobalt">Admin</p>
          <h1 className="font-heading text-2xl font-bold text-graphite italic">Enter Password</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="Password"
            className="w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-body text-sm text-graphite"
          />
          <button
            onClick={login}
            className="font-mono text-xs uppercase tracking-widest bg-cobalt text-alabaster px-6 py-3 rounded hover:opacity-90 transition-opacity"
          >
            Enter
          </button>
          {authError && <p className="font-mono text-xs text-red-500">{authError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-alabaster">
      <div className="px-6 md:px-16 py-6 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-graphite/50 hover:text-graphite transition-colors focus:outline-none focus:ring-2 focus:ring-cobalt focus:ring-offset-4 rounded"
        >
          <ArrowLeft className="w-3 h-3" /> Home
        </Link>
        <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-graphite/30">
          NCI Signal
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-6 md:px-16 pt-8 pb-20 md:pb-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease }}
          className="mb-16 space-y-6"
        >
          <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-cobalt">Admin</p>
          <h1 className="font-heading text-4xl md:text-6xl font-bold text-graphite italic">
            Generate Podcast
          </h1>
        </motion.div>

        <div className="mb-16 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-cobalt mb-2">
                Candidates
              </p>
              <p className="font-body text-sm text-graphite/50 max-w-lg">
                {selectedFeed?.slug && selectedFeed.slug !== "flagship"
                  ? `Papers matching “${selectedFeed.topic_query}”${selectedFeed.require_nci ? " and NCI support" : ""}, filtered by PubMed Trending.`
                  : "This week's NCI-supported papers that also appear on PubMed Trending, ranked by trending order. If none overlap, the full weekly NCI list is shown."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={feedSlug}
                onChange={(e) => setFeedSlug(e.target.value)}
                className="font-mono text-xs uppercase tracking-widest bg-transparent border-b border-graphite/15 py-2 outline-none"
              >
                {(feeds.length ? feeds : [{ slug: "flagship", name: "NCI Signal" }]).map((feed) => (
                  <option key={feed.slug} value={feed.slug}>
                    {feed.name}
                  </option>
                ))}
              </select>
              <select
                value={windowDays}
                onChange={(e) => setWindowDays(e.target.value)}
                className="font-mono text-xs uppercase tracking-widest bg-transparent border-b border-graphite/15 py-2 outline-none"
              >
                <option value="7d">Last 7 days</option>
                <option value="14d">Last 14 days</option>
                <option value="30d">Last 30 days</option>
              </select>
              <button
                onClick={fetchCandidates}
                disabled={candidateStatus === "loading"}
                className="font-mono text-xs uppercase tracking-widest text-graphite/50 hover:text-cobalt transition-colors disabled:opacity-50"
              >
                {candidateStatus === "loading" ? "Finding…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="border border-graphite/10 rounded p-4 space-y-4">
            <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-graphite/40">
              New scoped feed
            </p>
            <p className="font-body text-sm text-graphite/50">
              Scope a PubMed topic the flagship weekly list will miss. Finding candidates does not generate audio. Generate still publishes to the flagship catalog.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Feed name">
                <input
                  value={newFeed.name}
                  onChange={(e) => setNewFeed((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Pancreatic cancer"
                  className="w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-body text-sm text-graphite"
                />
              </Field>
              <Field label="PubMed topic">
                <input
                  value={newFeed.topic_query}
                  onChange={(e) => setNewFeed((f) => ({ ...f, topic_query: e.target.value }))}
                  placeholder='pancreatic neoplasms[mh] OR "pancreatic cancer"[tiab]'
                  className="w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-body text-sm text-graphite"
                />
              </Field>
              <Field label="Script prompt">
                <select
                  value={newFeed.prompt}
                  onChange={(e) => setNewFeed((f) => ({ ...f, prompt: e.target.value }))}
                  className="w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-mono text-xs text-graphite"
                >
                  {feedPrompts.map((prompt) => (
                    <option key={prompt} value={prompt}>{prompt}</option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-graphite/50">
              <input
                type="checkbox"
                checked={newFeed.require_nci}
                onChange={(e) => setNewFeed((f) => ({ ...f, require_nci: e.target.checked }))}
              />
              NCI grant filter
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={saveFeed}
                disabled={feedBusy}
                className="font-mono text-xs uppercase tracking-widest bg-cobalt text-alabaster px-4 py-2 rounded hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {feedBusy ? "Saving…" : "Save feed"}
              </button>
              {selectedFeed?.slug && selectedFeed.slug !== "flagship" && (
                <button
                  onClick={() => removeFeed(selectedFeed.slug)}
                  disabled={feedBusy}
                  className="font-mono text-xs uppercase tracking-widest text-graphite/45 hover:text-red-500 disabled:opacity-50"
                >
                  Delete this feed
                </button>
              )}
            </div>
            {feedError && <p className="font-mono text-xs text-red-500">{feedError}</p>}
          </div>

          {candidateMeta && (
            <p className="font-mono text-[11px] text-graphite/35">
              Window {candidateMeta.window} · queried {candidateMeta.queried} · kept {candidateMeta.kept}
              {typeof candidateMeta.trending_hits === "number"
                ? ` · trending overlap ${candidateMeta.trending_hits}/${candidateMeta.trending_listed ?? "?"}`
                : ""}
              {candidateMeta.attention_source ? ` · ${candidateMeta.attention_source.replaceAll("_", " ")}` : ""}
            </p>
          )}
          {candidateError && <p className="font-mono text-xs text-red-500">{candidateError}</p>}
          {candidateStatus === "loading" && (
            <p className="font-mono text-xs text-graphite/40">
              {selectedFeed?.slug && selectedFeed.slug !== "flagship"
                ? "Searching this feed's papers and PubMed Trending…"
                : "Searching this week's NCI papers and PubMed Trending…"}
            </p>
          )}
          {candidateStatus === "ready" && candidates.length === 0 && (
            <p className="font-mono text-xs text-graphite/40">
              No unused papers in this feed's window.
            </p>
          )}

          <div className="space-y-4">
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate.pmid}
                candidate={candidate}
                selected={paperMeta?.pmid === candidate.pmid}
                requireNci={candidateMeta?.require_nci !== false}
                onUse={() => usePaper(candidate)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-8">
          {paperMeta && (
            <div className="border border-cobalt/20 bg-cobalt/5 rounded p-4 space-y-2">
              <p className="font-mono text-[11px] tracking-widest uppercase text-cobalt">Selected paper</p>
              <p className="font-body text-sm text-graphite">{paperMeta.title}</p>
              <p className="font-mono text-[11px] text-graphite/40">
                {paperMeta.journal} · PMID {paperMeta.pmid}
              </p>
            </div>
          )}

          <Field label="Upload Paper PDF">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files[0])}
              className="w-full font-body text-sm text-graphite"
            />
            {pdfFile && (
              <p className="font-mono text-[11px] text-graphite/40">{pdfFile.name}</p>
            )}
            <p className="font-mono text-[10px] tracking-wide uppercase text-graphite/30">
              Flagship-journal PDFs are often paywalled. Manual upload is the fallback.
            </p>
          </Field>

          <Field label="Publication URL">
            <input
              className="w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-body text-sm text-graphite"
              value={form.publication_url}
              onChange={handleChange("publication_url")}
            />
          </Field>

          <Field label="Tool URL">
            <input
              className="w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-body text-sm text-graphite"
              value={form.tool_url}
              onChange={handleChange("tool_url")}
            />
          </Field>

          <Field label="Image URL">
            <input
              className="w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-body text-sm text-graphite"
              value={form.image_url}
              onChange={handleChange("image_url")}
            />
          </Field>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="font-mono text-xs uppercase tracking-widest bg-cobalt text-alabaster px-6 py-3 rounded hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSubmitting ? "Queuing…" : "Generate Podcast"}
          </button>

          {message && (
            <p
              className={`font-mono text-xs ${
                status === "error" ? "text-red-500" : "text-cobalt"
              }`}
            >
              {message}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 md:px-16 pt-8 pb-20 space-y-8">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-cobalt">
            Unpublished Podcasts ({pendingEpisodes.length})
          </p>

          <button
            onClick={fetchEpisodes}
            className="font-mono text-xs uppercase tracking-widest text-graphite/50 hover:text-cobalt transition-colors"
          >
            Refresh
          </button>
        </div>

        {pendingEpisodes.length === 0 ? (
          <p className="font-mono text-xs text-graphite/40">
            No unpublished podcasts found.
          </p>
        ) : (
        pendingEpisodes.map((ep) => (
          <EpisodeEditorCard
            key={ep.id}
            episode={ep}
            mode="publish"
            onSaved={fetchEpisodes}
          />
        ))
      )}
      </div>

      <div className="max-w-3xl mx-auto px-6 md:px-16 pt-8 pb-20 space-y-8">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-cobalt">
            Published Podcasts ({publishedEpisodes.length})
          </p>
          <button
            onClick={fetchEpisodes}
            className="font-mono text-xs uppercase tracking-widest text-graphite/50 hover:text-cobalt transition-colors"
          >
            Refresh
          </button>
        </div>
        <p className="font-body text-sm text-graphite/50">
          Edit title, description, tags, or image URL. Saving updates the public catalog without regenerating audio.
        </p>
        {publishedEpisodes.length === 0 ? (
          <p className="font-mono text-xs text-graphite/40">
            No published podcasts yet.
          </p>
        ) : (
          publishedEpisodes.map((ep) => (
            <EpisodeEditorCard
              key={ep.id}
              episode={ep}
              mode="save"
              onSaved={fetchEpisodes}
            />
          ))
        )}
    </div>

    <Footer />
  </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] tracking-widest uppercase text-graphite/40">{label}</p>
      {children}
    </div>
  );
}

function CandidateCard({ candidate, selected, requireNci, onUse }) {
  return (
    <div className={`border rounded p-4 space-y-3 ${selected ? "border-cobalt" : "border-graphite/15"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-widest uppercase text-cobalt">
          {candidate.lane === "rcr"
            ? "Citation lane"
            : candidate.lane === "trending"
              ? "PubMed trending"
              : requireNci === false
                ? "This week"
                : "This week's NCI"}
        </span>
        {candidate.journal && (
          <span className="font-mono text-[10px] tracking-widest uppercase text-graphite/40">
            {candidate.journal}
          </span>
        )}
        {candidate.pub_date && (
          <span className="font-mono text-[10px] text-graphite/35">{candidate.pub_date}</span>
        )}
      </div>
      <p className="font-body text-sm text-graphite leading-snug">{candidate.title}</p>
      <div className="flex flex-wrap gap-2">
        {(candidate.nci_grants || []).slice(0, 3).map((grant) => (
          <span key={grant} className="px-2 py-1 rounded-full border border-graphite/10 font-mono text-[10px] tracking-wider uppercase text-graphite/45">
            {grant}
          </span>
        ))}
        {(candidate.outputs || []).map((output) => (
          <span key={`${output.type}-${output.id}`} className="px-2 py-1 rounded-full border border-mint/20 font-mono text-[10px] tracking-wider uppercase text-mint">
            {output.type}
          </span>
        ))}
        {typeof candidate.trending_rank === "number" && (
          <span className="font-mono text-[10px] text-graphite/35">
            Trending #{candidate.trending_rank}
          </span>
        )}
        {typeof candidate.rcr === "number" && (
          <span className="font-mono text-[10px] text-graphite/35">RCR {candidate.rcr.toFixed(2)}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={onUse}
          className="font-mono text-xs uppercase tracking-widest bg-cobalt text-alabaster px-4 py-2 rounded hover:opacity-90 transition-opacity"
        >
          Use this paper
        </button>
        <a
          href={candidate.pubmed_url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] uppercase tracking-widest text-graphite/45 hover:text-cobalt"
        >
          PubMed
        </a>
        {candidate.doi && (
          <a
            href={`https://doi.org/${candidate.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] uppercase tracking-widest text-graphite/45 hover:text-cobalt"
          >
            DOI
          </a>
        )}
        {candidate.trending_rank && (
          <a
            href={candidate.trending_url || "https://pubmed.ncbi.nlm.nih.gov/trending/"}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] uppercase tracking-widest text-graphite/45 hover:text-cobalt"
          >
            Trending
          </a>
        )}
      </div>
    </div>
  );
}

function EpisodeEditorCard({ episode, mode, onSaved }) {
  const [title, setTitle] = useState(episode.title || "");
  const [description, setDescription] = useState(episode.description || "");
  const [tags, setTags] = useState((episode.tags || []).join(", "));
  const [imageUrl, setImageUrl] = useState(episode.image_url || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const endpoint = mode === "publish" ? "/api/podcasts/publish" : "/api/podcasts/update";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          id: episode.id,
          title,
          description,
          image_url: imageUrl,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save");
      }

      setSaved(true);
      await onSaved();
    } catch (e) {
      console.error("Episode save failed:", e);
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-graphite/15 rounded p-4 space-y-4">
      <p className="font-mono text-[11px] text-graphite/35">
        {episode.journal ? `${episode.journal} · ` : ""}
        {episode.pmid ? `PMID ${episode.pmid}` : episode.id}
      </p>
      <Field label="Title">
        <input
          className="w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-body text-sm text-graphite"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="Description">
        <textarea
          rows={3}
          className="w-full bg-transparent border border-graphite/15 focus:border-cobalt outline-none p-3 font-body text-sm text-graphite rounded"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Image URL">
        <input
          className="w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-body text-sm text-graphite"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://"
        />
      </Field>
      {imageUrl ? (
        <img src={imageUrl} alt="" className="max-h-32 rounded object-cover" />
      ) : null}
      <Field label="Tags (comma separated)">
        <input
          className="w-full bg-transparent border-b border-graphite/15 focus:border-cobalt outline-none py-2 font-body text-sm text-graphite"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </Field>
      <button
        onClick={handleSave}
        disabled={saving}
        className="font-mono text-xs uppercase tracking-widest bg-cobalt text-alabaster px-6 py-3 rounded hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {saving
          ? mode === "publish" ? "Publishing…" : "Saving…"
          : mode === "publish" ? "Publish" : "Save changes"}
      </button>
      {saved && mode === "save" && (
        <p className="font-mono text-xs text-cobalt">Saved. Public pages will pick this up on refresh.</p>
      )}
      {error && <p className="font-mono text-xs text-red-500">{error}</p>}
    </div>
  );
}
