import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import moment from "moment";
import { contentCount, mediumLabel } from "@/lib/signalOptions";
import MediumIcon from "@/components/signals/MediumIcon";

const ease = [0.16, 1, 0.3, 1];

export default function SignalCard({ signal, index = 0 }) {
  const href = signal.href || `/signals/${signal.slug}`;
  return (
    <motion.article
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: Math.min(index, 8) * 0.06, ease }}
      className="group h-full"
    >
      <Link
        to={href}
        className={`flex h-full flex-col rounded-xl border bg-white p-6 transition-colors focus:outline-none focus:ring-2 focus:ring-cobalt focus:ring-offset-4 focus:ring-offset-alabaster ${
          signal.featured ? "border-cobalt/30 hover:border-cobalt" : "border-graphite/10 hover:border-cobalt/40"
        }`}
      >
        <div className="flex items-center justify-between gap-3 mb-6">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase text-cobalt">
            <MediumIcon medium={signal.medium} className="w-3.5 h-3.5" />
            {mediumLabel(signal.medium)}
          </span>
          {signal.featured ? (
            <span className="px-2 py-1 rounded-full bg-cobalt text-white font-mono text-[9px] tracking-widest uppercase">
              Flagship
            </span>
          ) : signal.visibility === "unlisted" ? (
            <span className="px-2 py-1 rounded-full border border-graphite/15 font-mono text-[9px] tracking-widest uppercase text-graphite/40">
              Unlisted
            </span>
          ) : null}
        </div>

        {signal.image_url && (
          <img src={signal.image_url} alt="" className="h-12 w-auto self-start mb-4" />
        )}

        <h3 className="font-heading text-xl font-semibold text-graphite leading-snug group-hover:text-cobalt transition-colors">
          {signal.title}
        </h3>
        {signal.description && (
          <p className="font-body text-sm text-graphite/55 leading-relaxed mt-2 line-clamp-3">{signal.description}</p>
        )}
        {signal.cover?.title && (
          <p className="font-body text-xs text-graphite/45 mt-4 line-clamp-2">
            <span className="font-mono uppercase tracking-widest text-[10px] text-mint">Latest · </span>
            {signal.cover.title}
          </p>
        )}

        <div className="mt-auto pt-6 flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-graphite/50">
            by {signal.author?.name || "Unknown"}
          </span>
          <span className="font-mono text-[11px] text-graphite/35">
            {signal.featured
              ? "Weekly"
              : `${contentCount(signal.item_count)}${
                signal.latest_item_at ? ` · ${moment(signal.latest_item_at).fromNow()}` : ""
              }`}
          </span>
        </div>
      </Link>
    </motion.article>
  );
}
