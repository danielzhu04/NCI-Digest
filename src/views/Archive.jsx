import React, { useState, useEffect } from "react";
import { episodeAPI } from "@/api/episodes";
import { Link } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import EpisodeCard from "@/components/podcast/EpisodeCard";
import Footer from "@/components/podcast/Footer";
import { motion } from "framer-motion";

const ease = [0.16, 1, 0.3, 1];

export default function Archive() {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    episodeAPI.list()
      .then((episodes) => setEpisodes(episodes.filter((ep) => ep.published !== false)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredEpisodes = episodes.filter((ep) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      ep.title?.toLowerCase().includes(q) ||
      ep.paper_title?.toLowerCase().includes(q) ||
      ep.description?.toLowerCase().includes(q) ||
      ep.tags?.some((t) => t.toLowerCase().includes(q)) ||
      ep.journal?.toLowerCase().includes(q) ||
      ep.pmid?.toLowerCase().includes(q) ||
      ep.nci_grants?.some((g) => g.toLowerCase().includes(q))
    );
  });

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

      <div className="max-w-7xl mx-auto px-6 md:px-16 pt-8 pb-20 md:pb-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease }}
          className="mb-16 space-y-6"
        >
          <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-cobalt">Complete Archive</p>
          <h1 className="font-heading text-4xl md:text-6xl font-bold text-graphite italic">
            All Syntheses
          </h1>

          <div className="max-w-md flex items-center border-b border-graphite/15 pb-1 focus-within:border-cobalt transition-colors">
            <Search className="w-4 h-4 text-graphite/30 mr-3" />
            <input
              type="text"
              placeholder="Search episodes, papers, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent font-body text-sm text-graphite placeholder:text-graphite/30 outline-none py-2"
            />
          </div>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-graphite/10 border-t-cobalt rounded-full animate-spin" />
          </div>
        ) : filteredEpisodes.length === 0 ? (
          <div className="text-center py-32">
            <p className="font-mono text-[11px] tracking-widest uppercase text-graphite/40">
              {searchQuery ? "No matching episodes" : "Awaiting first synthesis"}
            </p>
          </div>
        ) : (
          <>
            <p className="font-mono text-[11px] text-graphite/30 mb-8">
              {filteredEpisodes.length} episode{filteredEpisodes.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-16">
              {filteredEpisodes.map((ep, i) => (
                <EpisodeCard key={ep.id} episode={ep} index={i} />
              ))}
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
