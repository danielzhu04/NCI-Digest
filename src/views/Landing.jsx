import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Search } from "lucide-react";
import { signalAPI } from "@/api/signals";
import { useAuth } from "@/lib/AuthContext";
import { FLAGSHIP_SIGNAL, MEDIUMS } from "@/lib/signalOptions";
import PlatformHeader from "@/components/signals/PlatformHeader";
import SignalCard from "@/components/signals/SignalCard";
import MediumIcon from "@/components/signals/MediumIcon";
import Footer from "@/components/podcast/Footer";

const ease = [0.16, 1, 0.3, 1];

export default function Landing() {
  const { user } = useAuth();
  const location = useLocation();
  const [signals, setSignals] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [medium, setMedium] = useState("all");

  useEffect(() => {
    signalAPI.listPublic()
      .then((data) => setSignals(data.signals || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) {
      setMine([]);
      return;
    }
    signalAPI.listMine()
      .then((data) => setMine(data.signals || []))
      .catch(() => setMine([]));
  }, [user]);

  useEffect(() => {
    if (location.hash === "#community" && !loading) {
      document.getElementById("community")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [location.hash, loading]);

  const gallery = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [FLAGSHIP_SIGNAL, ...signals].filter((signal) => {
      if (medium !== "all" && signal.medium !== medium) return false;
      if (!q) return true;
      return [signal.title, signal.description, signal.author?.name, signal.criteria?.keywords, signal.cover?.title]
        .some((value) => value?.toLowerCase().includes(q));
    });
  }, [signals, query, medium]);

  return (
    <div className="min-h-screen bg-alabaster">
      <PlatformHeader />

      <section className="px-6 md:px-16 pt-16 md:pt-24 pb-20 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease }}
          className="max-w-3xl space-y-6"
        >
          <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-cobalt">NCI Digest</p>
          <h1 className="font-heading text-4xl md:text-6xl lg:text-7xl font-bold text-graphite leading-[1.1] italic">
            Convert research papers into digestible formats.
          </h1>
          <p className="font-body text-base md:text-lg text-graphite/60 leading-relaxed max-w-2xl">
            Start a collection around a topic you care about. Then turn each paper into an engaging podcast,
            TED-style talk, slide deck, or narrated video, and share that content from your collection.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              to="/signals/new"
              className="inline-flex items-center gap-2 bg-cobalt text-white px-6 py-3 rounded-full font-body text-sm font-medium hover:bg-cobalt/90 transition-colors focus:outline-none focus:ring-2 focus:ring-cobalt focus:ring-offset-4 focus:ring-offset-alabaster"
            >
              Start a collection <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#community"
              className="font-mono text-xs uppercase tracking-widest text-graphite/50 hover:text-cobalt transition-colors"
            >
              Browse community collections
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.15, ease }}
          className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl"
        >
          {[
            { n: "01", t: "Start a collection", d: "Name a topic and choose a default format." },
            { n: "02", t: "Add a paper", d: "Search PubMed with your criteria, or upload a PDF." },
            { n: "03", t: "Share content from your collection", d: "Send a podcast, talk, slides, or video to colleagues." },
          ].map((step) => (
            <div key={step.n}>
              <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-cobalt mb-2">{step.n}</p>
              <p className="font-heading text-lg font-semibold text-graphite">{step.t}</p>
              <p className="font-body text-sm text-graphite/50 mt-1 leading-relaxed">{step.d}</p>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.25, ease }}
          className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {MEDIUMS.map((m) => (
            <Link
              key={m.id}
              to={`/signals/new?medium=${m.id}`}
              className="rounded-xl border border-graphite/10 bg-white p-5 hover:border-cobalt transition-colors focus:outline-none focus:ring-2 focus:ring-cobalt focus:ring-offset-4"
            >
              <MediumIcon medium={m.id} className="w-5 h-5 text-cobalt" />
              <p className="font-heading text-lg font-semibold text-graphite mt-3">{m.action}</p>
              <p className="font-body text-xs text-graphite/50 mt-1 leading-relaxed">{m.blurb}</p>
            </Link>
          ))}
        </motion.div>
      </section>

      {mine.length > 0 && (
        <section className="px-6 md:px-16 pb-16 max-w-7xl mx-auto">
          <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-cobalt mb-6">Your collections</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mine.map((signal, i) => (
              <SignalCard key={signal.id} signal={signal} index={i} />
            ))}
          </div>
        </section>
      )}

      <section id="community" className="px-6 md:px-16 py-16 md:py-24 max-w-7xl mx-auto scroll-mt-8">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
          <div>
            <p className="font-mono text-[11px] tracking-[0.4em] uppercase text-cobalt mb-3">Gallery</p>
            <h2 className="font-heading text-3xl md:text-5xl font-bold text-graphite italic">Community collections</h2>
            <p className="font-body text-base text-graphite/50 mt-4 max-w-lg">
              Public collections from other researchers, each focused on a corner of cancer research.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center border-b border-graphite/15 pb-1 focus-within:border-cobalt transition-colors">
              <Search className="w-4 h-4 text-graphite/30 mr-2" />
              <input
                type="text"
                placeholder="Search collections…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="bg-transparent font-body text-sm text-graphite placeholder:text-graphite/30 outline-none py-2 w-48"
              />
            </div>
            <select
              value={medium}
              onChange={(e) => setMedium(e.target.value)}
              className="font-mono text-xs uppercase tracking-widest bg-transparent border-b border-graphite/15 py-2 outline-none"
            >
              <option value="all">All formats</option>
              {MEDIUMS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="font-mono text-xs text-red-500 mb-6">{error}</p>}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-graphite/10 border-t-cobalt rounded-full animate-spin" />
          </div>
        ) : gallery.length === 0 ? (
          <p className="font-mono text-[11px] tracking-widest uppercase text-graphite/40 py-24 text-center">
            No matching collections
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {gallery.map((signal, i) => (
              <SignalCard key={signal.slug} signal={signal} index={i} />
            ))}
          </div>
        )}
      </section>

      <Footer platform />
    </div>
  );
}
