import React, { useState, useEffect } from "react";
import { episodeAPI } from "@/api/episodes";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, Headphones, Play, Calendar, Clock, Users } from "lucide-react";
import { motion } from "framer-motion";
import moment from "moment";
import Footer from "@/components/podcast/Footer";
import PodcastVisualizer from "@/components/podcast/PodcastVisualizer";

const ease = [0.16, 1, 0.3, 1];

export default function EpisodeDetail() {
  const { id } = useParams();
  const [episode, setEpisode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audioEl, setAudioEl] = useState(null);

  useEffect(() => {
    episodeAPI.get(id)
      .then(setEpisode)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-alabaster flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-graphite/10 border-t-cobalt rounded-full animate-spin" />
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="min-h-screen bg-alabaster flex flex-col items-center justify-center gap-6">
        <p className="font-mono text-[11px] tracking-widest uppercase text-graphite/40">Episode not found</p>
        <Link
          to="/nci-signal/archive"
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cobalt hover:text-cobalt/70 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Return to Archive
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-alabaster">
      <div className="px-6 md:px-16 py-6 flex items-center justify-between">
        <Link
          to="/nci-signal"
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-graphite/50 hover:text-graphite transition-colors focus:outline-none focus:ring-2 focus:ring-cobalt focus:ring-offset-4 rounded"
        >
          <ArrowLeft className="w-3 h-3" /> NCI Signal
        </Link>
        <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-graphite/30">
          NCI Signal
        </p>
      </div>

      <div className="max-w-5xl mx-auto px-6 md:px-16 pt-8 pb-16 md:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease }}
          className="space-y-6"
        >
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-mono text-[11px] tracking-widest uppercase text-cobalt">
              EP.{String(episode.episode_number || 0).padStart(3, "0")}
            </span>
            {episode.publish_date && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-graphite/40">
                <Calendar className="w-3 h-3" />
                {moment(episode.publish_date).format("MMMM DD, YYYY")}
              </span>
            )}
            {episode.duration && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-graphite/40">
                <Clock className="w-3 h-3" />
                {episode.duration}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-graphite/40">
              <Users className="w-3 h-3" />
              {episode.hosts || "Axiom & Trinity"}
            </span>
          </div>

          <h1 className="font-heading text-3xl md:text-5xl lg:text-6xl font-bold text-graphite leading-[1.1] italic">
            {episode.title}
          </h1>

          <p className="font-body text-lg md:text-xl text-graphite/50 leading-relaxed max-w-3xl">
            {episode.paper_title}
          </p>
        </motion.div>

        {!episode.recording_url && episode.image_url && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.15, ease }}
            className="mt-12 rounded-xl overflow-hidden aspect-[16/9] bg-graphite/5"
          >
            <img src={episode.image_url} alt={episode.title} className="w-full h-full object-cover" />
          </motion.div>
        )}

        {episode.recording_url && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease }}
            className="mt-12 p-6 bg-white rounded-xl border border-graphite/8 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-cobalt rounded-full flex items-center justify-center">
                <Headphones className="w-4 h-4 text-white" />
              </div>
              <p className="font-mono text-[11px] tracking-widest uppercase text-graphite/50">Podcast Recording</p>
            </div>
            <audio
              ref={setAudioEl}
              controls
              className="w-full"
              preload="metadata"
              crossOrigin="anonymous"
              src={episode.recording_url}
            >
              Your browser does not support the audio element.
            </audio>
            <div className="mt-5">
              <PodcastVisualizer
                audioEl={audioEl}
                backgroundUrl={episode.image_url}
                title={episode.title}
              />
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease }}
          className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          {(episode.outputs?.length || episode.tool_url) ? (
            <a href={(episode.outputs?.[0]?.url) || episode.tool_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 px-6 py-5 bg-cobalt text-white rounded-xl font-mono text-xs tracking-widest uppercase hover:bg-cobalt/90 transition-colors">
              <ExternalLink className="w-4 h-4" /> {episode.outputs?.[0] ? `Open ${episode.outputs[0].type}` : "Open Tool"}
            </a>
          ) : (
            <div className="flex items-center justify-center gap-3 px-6 py-5 bg-graphite/5 text-graphite/30 rounded-xl font-mono text-xs tracking-widest uppercase cursor-not-allowed">
              <ExternalLink className="w-4 h-4" /> No Outputs
            </div>
          )}
          {episode.publication_url ? (
            <a href={episode.publication_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 px-6 py-5 bg-mint text-white rounded-xl font-mono text-xs tracking-widest uppercase hover:bg-mint/90 transition-colors">
              <FileText className="w-4 h-4" /> Read Paper
            </a>
          ) : (
            <div className="flex items-center justify-center gap-3 px-6 py-5 bg-graphite/5 text-graphite/30 rounded-xl font-mono text-xs tracking-widest uppercase cursor-not-allowed">
              <FileText className="w-4 h-4" /> No Paper
            </div>
          )}
          {episode.recording_url ? (
            <a href={episode.recording_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 px-6 py-5 bg-graphite text-white rounded-xl font-mono text-xs tracking-widest uppercase hover:bg-graphite/90 transition-colors">
              <Play className="w-4 h-4" /> Play Recording
            </a>
          ) : (
            <div className="flex items-center justify-center gap-3 px-6 py-5 bg-graphite/5 text-graphite/30 rounded-xl font-mono text-xs tracking-widest uppercase cursor-not-allowed">
              <Play className="w-4 h-4" /> No Recording
            </div>
          )}
        </motion.div>

        {(episode.journal || episode.pmid || (episode.nci_grants && episode.nci_grants.length > 0) || episode.impact?.reason) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.45, ease }}
            className="mt-16 space-y-4"
          >
            <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-graphite/30">NCI Support</p>
            <div className="flex flex-wrap gap-2">
              {episode.journal && (
                <span className="px-3 py-1.5 rounded-full border border-graphite/10 font-mono text-[10px] tracking-widest uppercase text-graphite/50">
                  {episode.journal}
                </span>
              )}
              {episode.pmid && (
                <a
                  href={`https://pubmed.ncbi.nlm.nih.gov/${episode.pmid}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-full border border-graphite/10 font-mono text-[10px] tracking-widest uppercase text-cobalt"
                >
                  PMID {episode.pmid}
                </a>
              )}
              {(episode.nci_grants || []).map((grant) => (
                <span key={grant} className="px-3 py-1.5 rounded-full border border-cobalt/20 font-mono text-[10px] tracking-widest uppercase text-cobalt">
                  {grant}
                </span>
              ))}
            </div>
            {episode.impact?.reason && (
              <p className="font-body text-sm text-graphite/50">
                Selected because: {episode.impact.reason}
                {typeof episode.impact.rcr === "number" ? ` (RCR ${episode.impact.rcr.toFixed(2)})` : ""}
              </p>
            )}
          </motion.div>
        )}

        {episode.outputs && episode.outputs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.48, ease }}
            className="mt-10 space-y-4"
          >
            <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-graphite/30">Reusable Outputs</p>
            <div className="flex flex-col gap-3">
              {episode.outputs.map((output) => (
                <a
                  key={`${output.type}-${output.id}`}
                  href={output.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 font-mono text-xs tracking-widest uppercase text-cobalt hover:text-cobalt/70"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {output.type}: {output.id}
                </a>
              ))}
            </div>
          </motion.div>
        )}

        {episode.description && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease }}
            className="mt-16"
          >
            <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-graphite/30 mb-4">Synopsis</p>
            <div className="font-body text-base md:text-lg text-graphite/70 leading-relaxed max-w-3xl whitespace-pre-line">
              {episode.description}
            </div>
          </motion.div>
        )}

        {episode.tags && episode.tags.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6, ease }}
            className="mt-12 flex flex-wrap gap-2"
          >
            {episode.tags.map((tag, i) => (
              <span key={i} className="px-3 py-1.5 rounded-full border border-graphite/10 font-mono text-[10px] tracking-widest uppercase text-graphite/40">
                {tag}
              </span>
            ))}
          </motion.div>
        )}
      </div>

      <Footer />
    </div>
  );
}
