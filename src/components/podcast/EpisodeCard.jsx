import React from "react";
import { motion } from "framer-motion";
import { Play, ExternalLink, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import moment from "moment";

const ease = [0.16, 1, 0.3, 1];

export default function EpisodeCard({ episode, index }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: index * 0.08, ease }}
      className="group"
    >
      <Link to={`/nci-signal/episode/${episode.id}`} className="block focus:outline-none focus:ring-2 focus:ring-cobalt focus:ring-offset-4 focus:ring-offset-alabaster rounded-lg">
        {/* Image */}
        <div className="relative overflow-hidden rounded-lg aspect-[4/3] bg-graphite/5 mb-5">
          {episode.image_url ? (
            <img
              src={episode.image_url}
              alt={episode.title}
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-16 h-16 border border-graphite/10 rounded-full flex items-center justify-center">
                <Play className="w-6 h-6 text-graphite/20" />
              </div>
            </div>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-cobalt/0 group-hover:bg-cobalt/10 transition-colors duration-500 flex items-center justify-center">
            <motion.div
              className="w-14 h-14 bg-cobalt rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-lg"
            >
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </motion.div>
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] tracking-widest uppercase text-cobalt">
              EP.{String(episode.episode_number || 0).padStart(3, "0")}
            </span>
            {episode.publish_date && (
              <span className="font-mono text-[11px] text-graphite/40">
                {moment(episode.publish_date).format("MMM DD, YYYY")}
              </span>
            )}
            {episode.duration && (
              <span className="font-mono text-[11px] text-graphite/40">
                {episode.duration}
              </span>
            )}
          </div>
          <h3 className="font-heading text-xl font-semibold text-graphite leading-snug group-hover:text-cobalt transition-colors duration-300">
            {episode.title}
          </h3>
          <p className="font-body text-sm text-graphite/50 leading-relaxed line-clamp-2">
            {episode.paper_title}
          </p>
          {(episode.journal || (episode.nci_grants && episode.nci_grants.length > 0)) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {episode.journal && (
                <span className="px-2 py-1 rounded-full border border-graphite/10 font-mono text-[10px] tracking-wider uppercase text-graphite/40">
                  {episode.journal}
                </span>
              )}
              {(episode.nci_grants || []).slice(0, 2).map((grant) => (
                <span key={grant} className="px-2 py-1 rounded-full border border-cobalt/15 font-mono text-[10px] tracking-wider uppercase text-cobalt/80">
                  {grant}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>

      {/* Quick links */}
      <div className="flex items-center gap-4 mt-4">
        {(episode.outputs?.[0]?.url || episode.tool_url) && (
          <a
            href={episode.outputs?.[0]?.url || episode.tool_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase text-cobalt hover:text-cobalt/70 transition-colors focus:outline-none focus:ring-2 focus:ring-cobalt focus:ring-offset-2 rounded"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" /> {episode.outputs?.[0]?.type || "Tool"}
          </a>
        )}
        {episode.publication_url && (
          <a
            href={episode.publication_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase text-mint hover:text-mint/70 transition-colors focus:outline-none focus:ring-2 focus:ring-mint focus:ring-offset-2 rounded"
            onClick={(e) => e.stopPropagation()}
          >
            <FileText className="w-3 h-3" /> Paper
          </a>
        )}
        {episode.recording_url && (
          <a
            href={episode.recording_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase text-graphite/50 hover:text-graphite transition-colors focus:outline-none focus:ring-2 focus:ring-graphite focus:ring-offset-2 rounded"
            onClick={(e) => e.stopPropagation()}
          >
            <Play className="w-3 h-3" /> Listen
          </a>
        )}
      </div>
    </motion.article>
  );
}