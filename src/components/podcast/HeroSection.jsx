import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Play, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

const ease = [0.16, 1, 0.3, 1];

function GeometricCluster() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <img src="https://s3.k8s.maayanlab.cloud/axiom-podcasts/axiom.png" alt="Axiom" className="max-h-[140px] w-auto object-contain rounded-2xl" />
      <p className="absolute -bottom-8 font-mono text-xs text-cobalt tracking-widest uppercase">Axiom</p>
    </div>
  );
}

function OrganicForm() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <img src="https://s3.k8s.maayanlab.cloud/axiom-podcasts/trinity.png" alt="Trinity" className="max-h-[140px] w-auto object-contain rounded-2xl" />
      <p className="absolute -bottom-8 font-mono text-xs text-mint tracking-widest uppercase">Trinity</p>
    </div>
  );
}

export default function HeroSection({ latestEpisode }) {
  return (
    <section className="relative min-h-screen bg-alabaster flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="relative z-10 flex items-center justify-between px-6 md:px-16 py-6">
        <div>
          <h2 className="font-mono text-xs tracking-[0.3em] uppercase text-graphite/60">NCI-Supported Research</h2>
          <h1 className="font-heading text-lg md:text-xl font-semibold text-graphite tracking-tight">NCI Signal</h1>
    	</div>
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="font-mono text-xs tracking-widest uppercase text-graphite/40 hover:text-cobalt transition-colors flex items-center gap-1"
          >
            <ChevronLeft className="w-3 h-3" /> All collections
          </Link>
          <Link
            to="/nci-signal/archive"
            className="font-mono text-xs tracking-widest uppercase text-cobalt hover:text-cobalt/80 transition-colors flex items-center gap-1"
          >
            Archive <ChevronRight className="w-3 h-3" />
          </Link>
          <Link
            to="/admin"
            className="font-mono text-xs tracking-widest uppercase text-graphite/40 hover:text-cobalt transition-colors flex items-center gap-1"
          >
            Admin <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div> 

      {/* Split hero */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-0 px-6 md:px-16 pb-32 md:pb-40">
        {/* Left — Axiom */}
        <div className="flex-1 flex items-center justify-center h-48 md:h-auto">
          <GeometricCluster />
        </div>

        {/* Center — Title */}
        <div className="flex-1 text-center max-w-xl mx-auto flex flex-col items-center gap-6">
          <motion.p
            className="font-mono text-[11px] tracking-[0.4em] uppercase text-graphite/50"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease }}
          >
            Podcast Series
          </motion.p>
          <motion.h2
            className="font-heading text-4xl md:text-6xl lg:text-7xl font-bold text-graphite leading-[1.3] italic"
            initial={{ opacity: 0, y: 30 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.15, ease }}
          >
            Cancer Research Breakthroughs Supported by NCI 
          </motion.h2>
          <motion.p
            className="text-base md:text-lg text-graphite/60 leading-relaxed max-w-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3, ease }}
          >
            Each week, Axiom and Trinity take the cancer paper that drew the most attention — NCI-supported work, plus the data, code, and tools it left behind.
          </motion.p>
          {latestEpisode && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.45, ease }}
            >
              <Link
                to={`/nci-signal/episode/${latestEpisode.id}`}
                className="inline-flex items-center gap-3 bg-cobalt text-white px-6 py-3 rounded-full font-body text-sm font-medium hover:bg-cobalt/90 transition-colors focus:outline-none focus:ring-2 focus:ring-cobalt focus:ring-offset-4 focus:ring-offset-alabaster"
              >
                <Play className="w-4 h-4 fill-current" />
                Latest Episode
              </Link>
            </motion.div>
          )}
        </div>

        {/* Right — Trinity */}
        <div className="flex-1 flex items-center justify-center h-48 md:h-auto">
          <OrganicForm />
        </div>
      </div>

      {/* Ticker */}
      {latestEpisode && (
        <div className="absolute bottom-0 left-0 right-0 border-t border-graphite/10 bg-alabaster/80 backdrop-blur-sm overflow-hidden">
          <motion.div
            className="flex items-center gap-12 py-4 whitespace-nowrap"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          >
            {[...Array(6)].map((_, i) => (
              <span key={i} className="font-mono text-[11px] tracking-widest uppercase text-graphite/30">
                <span className="text-cobalt/50">●</span>{" "}
                NCI Signal: EP.{String(latestEpisode.episode_number || 1).padStart(3, "0")} — {latestEpisode.paper_title}
                {" "}<span className="text-mint/50">◆</span>{" "}
                Hosted by {latestEpisode.hosts || "Axiom & Trinity"}
              </span>
            ))}
          </motion.div>
        </div>
      )}
    </section>
  );
}
