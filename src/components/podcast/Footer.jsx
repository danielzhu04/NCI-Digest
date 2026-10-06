import React, { useState } from "react";
import { Github, Twitter, Globe, ArrowRight } from "lucide-react";

export default function Footer({ platform = false }) {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail("");
    }
  };

  return (
    <footer className="bg-graphite text-white/80">
      <div className="max-w-7xl mx-auto px-6 md:px-16 py-20 md:py-28">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-8">
          {/* Lab info */}
          <div className="space-y-5">
            <img
              src="https://s3.k8s.maayanlab.cloud/axiom-podcasts/logo.png?v=2"
              alt="NCI Signal"
              className="h-20 w-auto"
            />

            <h3 className="font-heading text-2xl font-semibold text-white">{platform ? "NCI Digest" : "NCI Signal"}</h3>
            <p className="font-body text-sm text-white/50 leading-relaxed max-w-xs">
              {platform
                ? "Turn cancer research papers into podcasts, talks, slides, or videos, then share that content from your collection. Built by the Ma'ayan Laboratory."
                : "Each week we cover the NCI-supported cancer paper that drew the most attention — and the data, code, and tools it left behind. Built by the Ma'ayan Laboratory."}
            </p>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] tracking-widest uppercase text-white/30">
                Hosts:
              </span>
              <span className="font-mono text-[10px] tracking-widest uppercase text-cobalt">
                Axiom
              </span>
              <span className="font-mono text-[10px] text-white/30">&</span>
              <span className="font-mono text-[10px] tracking-widest uppercase text-mint">
                Trinity
              </span>
            </div>
          </div>

          {/* Links */}
          <div className="space-y-5">
            <h4 className="font-mono text-[11px] tracking-[0.3em] uppercase text-white/40">Links</h4>
            <div className="space-y-3">
              <a
                href="https://labs.icahn.mssm.edu/maayanlab/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 font-body text-sm text-white/60 hover:text-white transition-colors"
              >
                <Globe className="w-3.5 h-3.5" /> Ma'ayan Lab Website
              </a>
              <a
                href="https://github.com/MaayanLab"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 font-body text-sm text-white/60 hover:text-white transition-colors"
              >
                <Github className="w-3.5 h-3.5" /> GitHub
              </a>
              <a
                href="https://x.com/MaayanLab"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 font-body text-sm text-white/60 hover:text-white transition-colors"
              >
                <Twitter className="w-3.5 h-3.5" /> X / Twitter
              </a>
            </div>
          </div>

          {/* Subscription */}
          <div className="space-y-5">
            <h4 className="font-mono text-[11px] tracking-[0.3em] uppercase text-white/40">Neural Subscription</h4>
            <p className="font-body text-sm text-white/40">Get notified when new episodes are synthesized.</p>
            {subscribed ? (
              <p className="font-mono text-[11px] tracking-widest text-mint uppercase">Subscription confirmed ●</p>
            ) : (
              <form onSubmit={handleSubscribe} className="flex items-center border-b border-white/20 pb-1 group focus-within:border-cobalt transition-colors">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="flex-1 bg-transparent font-mono text-sm text-white placeholder:text-white/25 outline-none py-2"
                />
                <button
                  type="submit"
                  className="p-2 text-white/40 hover:text-cobalt transition-colors focus:outline-none focus:ring-2 focus:ring-cobalt rounded"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-20 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[10px] tracking-widest uppercase text-white/20">
            © {new Date().getFullYear()} Ma'ayan Laboratory · Mount Sinai
          </p>
          <p className="font-mono text-[10px] tracking-widest uppercase text-white/20 max-w-xl text-center md:text-right">
            Grant tagging is incomplete. Episode selection is editorial.
          </p>
        </div>
      </div>
    </footer>
  );
}
