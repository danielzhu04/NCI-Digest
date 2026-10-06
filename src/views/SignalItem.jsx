import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import moment from "moment";
import { ArrowLeft, ExternalLink, FileText, Headphones } from "lucide-react";
import { signalAPI } from "@/api/signals";
import { mediumLabel, outputLabel } from "@/lib/signalOptions";
import PlatformHeader from "@/components/signals/PlatformHeader";
import MediumIcon from "@/components/signals/MediumIcon";
import ShareButtons from "@/components/signals/ShareButtons";
import SlideDeck from "@/components/signals/SlideDeck";
import NarratedSlides from "@/components/signals/NarratedSlides";
import Footer from "@/components/podcast/Footer";

const ease = [0.16, 1, 0.3, 1];
const POLL_MS = 2000;

export default function SignalItem() {
  const { slug, itemId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    signalAPI.item(slug, itemId)
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.status === 404 ? "This content is not available." : err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug, itemId]);

  const pending = data?.item?.status === "queued" || data?.item?.status === "running";
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(() => {
      signalAPI.item(slug, itemId)
        .then(setData)
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, slug, itemId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-alabaster flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-graphite/10 border-t-cobalt rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-alabaster">
        <PlatformHeader />
        <div className="text-center py-32 space-y-6">
          <p className="font-mono text-[11px] tracking-widest uppercase text-graphite/40">{error}</p>
          <Link to={`/signals/${slug}`} className="font-mono text-xs uppercase tracking-widest text-cobalt">Back to collection</Link>
        </div>
      </div>
    );
  }

  const { signal, item } = data;
  const content = item.content || {};
  const paper = item.paper || {};

  return (
    <div className="min-h-screen bg-alabaster">
      <PlatformHeader />

      <div className="max-w-5xl mx-auto px-6 md:px-16 pt-4 pb-24">
        <Link
          to={`/signals/${signal.slug}`}
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-graphite/50 hover:text-graphite transition-colors mb-10"
        >
          <ArrowLeft className="w-3 h-3" /> {signal.title}
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease }}
          className="space-y-5"
        >
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-widest uppercase text-cobalt">
              <MediumIcon medium={item.medium} className="w-3.5 h-3.5" /> {mediumLabel(item.medium)}
            </span>
            <span className="font-mono text-[11px] text-graphite/40">{moment(item.created_at).format("MMMM D, YYYY")}</span>
            {item.duration && <span className="font-mono text-[11px] text-graphite/40">{item.duration}</span>}
            <span className="font-mono text-[11px] text-graphite/40">by {signal.author.name}</span>
          </div>
          <h1 className="font-heading text-3xl md:text-5xl font-bold text-graphite italic leading-[1.1]">{item.title}</h1>
          {item.paper_title && (
            <p className="font-body text-lg text-graphite/50 leading-relaxed max-w-3xl">{item.paper_title}</p>
          )}
          <ShareButtons title={item.title} path={`/signals/${signal.slug}/items/${item.id}`} />
        </motion.div>

        {item.status !== "completed" ? (
          <div className="mt-12 space-y-4">
            <p className="font-mono text-xs text-graphite/50">
              {item.status === "failed"
                ? `Generation failed: ${item.error}`
                : "Still generating. The log below is the worker output for this job."}
            </p>
            {signal.is_owner && <GenerationLog item={item} live={pending} />}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease }}
            className="mt-12"
          >
            {(item.medium === "podcast" || item.medium === "ted_talk") && item.media_url && (
              <div className="p-6 bg-white rounded-xl border border-graphite/10 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-cobalt rounded-full flex items-center justify-center">
                    <Headphones className="w-4 h-4 text-white" />
                  </div>
                  <p className="font-mono text-[11px] tracking-widest uppercase text-graphite/50">
                    {item.medium === "podcast" ? "Podcast recording" : "Talk recording"}
                  </p>
                </div>
                <audio controls preload="metadata" src={item.media_url} className="w-full">
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}
            {item.medium === "slides" && content.slides && <SlideDeck slides={content.slides} />}
            {item.medium === "video" && content.slides && (
              <NarratedSlides slides={content.slides} audioUrl={item.media_url} />
            )}
          </motion.div>
        )}

        <div className="mt-10 flex flex-wrap gap-4">
          {item.publication_url && (
            <a
              href={item.publication_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 bg-mint text-white rounded-xl font-mono text-xs tracking-widest uppercase hover:bg-mint/90"
            >
              <FileText className="w-4 h-4" /> Read paper
            </a>
          )}
          {item.pmid && (
            <a
              href={`https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 border border-graphite/15 rounded-xl font-mono text-xs tracking-widest uppercase text-graphite/60 hover:border-cobalt hover:text-cobalt"
            >
              PMID {item.pmid}
            </a>
          )}
          {(paper.outputs || []).map((output) => (
            <a
              key={`${output.type}-${output.id}`}
              href={output.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 border border-cobalt/20 rounded-xl font-mono text-xs tracking-widest uppercase text-cobalt hover:border-cobalt"
            >
              <ExternalLink className="w-4 h-4" /> {outputLabel(output)}
            </a>
          ))}
        </div>

        {item.description && (
          <div className="mt-14">
            <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-graphite/30 mb-4">Summary</p>
            <p className="font-body text-base md:text-lg text-graphite/70 leading-relaxed max-w-3xl">{item.description}</p>
          </div>
        )}

        {(paper.nci_grants?.length > 0 || item.journal) && (
          <div className="mt-10 flex flex-wrap gap-2">
            {item.journal && (
              <span className="px-3 py-1.5 rounded-full border border-graphite/10 font-mono text-[10px] tracking-widest uppercase text-graphite/50">
                {item.journal}
              </span>
            )}
            {(paper.nci_grants || []).map((grant) => (
              <span key={grant} className="px-3 py-1.5 rounded-full border border-cobalt/20 font-mono text-[10px] tracking-widest uppercase text-cobalt">
                {grant}
              </span>
            ))}
          </div>
        )}

        {signal.is_owner && item.log && item.status === "completed" && (
          <details className="mt-14">
            <summary className="cursor-pointer font-mono text-[11px] tracking-[0.3em] uppercase text-graphite/50">
              Generation log
            </summary>
            <div className="mt-4">
              <GenerationLog item={item} />
            </div>
          </details>
        )}

        {content.script && (
          <details className="mt-14 rounded-xl border border-graphite/10 bg-white p-5">
            <summary className="cursor-pointer font-mono text-[11px] tracking-[0.3em] uppercase text-graphite/50">Transcript</summary>
            <div className="mt-4 font-body text-sm text-graphite/70 leading-relaxed whitespace-pre-line">{content.script}</div>
          </details>
        )}

        {item.tags?.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span key={tag} className="px-3 py-1.5 rounded-full border border-graphite/10 font-mono text-[10px] tracking-widest uppercase text-graphite/40">
                {tag}
              </span>
            ))}
          </div>
        )}

        <p className="mt-14 font-body text-xs text-graphite/35 max-w-2xl">
          AI-generated with {item.model}
          {item.source === "abstract" ? " from the paper's abstract only" : " from the full paper"}. It can contain mistakes; check the paper before citing.
        </p>
      </div>

      <Footer platform />
    </div>
  );
}

function GenerationLog({ item, live = false }) {
  const scroller = useRef(null);
  const log = item.log || "";
  const stale = live && item.updated_at && Date.now() - new Date(item.updated_at).getTime() > 90000;

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [log]);

  return (
    <div className="rounded-xl border border-graphite/15 bg-[#1c1c1a] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-white/10">
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-white/45">
          Worker output
        </p>
        <p className="font-mono text-[10px] text-white/35">
          {live ? "Live · updates every 2s" : "Saved log"}
          {item.updated_at ? ` · last write ${moment(item.updated_at).fromNow()}` : ""}
        </p>
      </div>
      <pre
        ref={scroller}
        className="max-h-[28rem] overflow-auto p-4 font-mono text-[12px] leading-relaxed text-[#d7f5c6] whitespace-pre-wrap break-words"
      >
        {log.trim() || (live
          ? "No output yet. If this stays empty, the worker has not picked up the job."
          : "No worker output was saved for this job.")}
      </pre>
      {stale && (
        <p className="px-4 py-2 border-t border-white/10 font-mono text-[11px] text-amber-200/90">
          No new log line for over 90 seconds. The worker is hung or the pod died; the card will stay Generating until the row is updated.
        </p>
      )}
    </div>
  );
}
