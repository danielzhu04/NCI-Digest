import React, { useState } from "react";
import { Check, Link2, Linkedin, Twitter } from "lucide-react";

export default function ShareButtons({ title, path }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
  const text = `${title} — made with NCI Digest`;

  const targets = [
    {
      label: "X",
      icon: Twitter,
      href: `https://twitter.com/intent/tweet?${new URLSearchParams({ text, url })}`,
    },
    {
      label: "LinkedIn",
      icon: Linkedin,
      href: `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url })}`,
    },
  ];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-graphite/35">Share</span>
      {targets.map(({ label, icon: Icon, href }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-graphite/15 font-mono text-[11px] tracking-wider uppercase text-graphite/60 hover:border-cobalt hover:text-cobalt transition-colors"
        >
          <Icon className="w-3.5 h-3.5" /> {label}
        </a>
      ))}
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-graphite/15 font-mono text-[11px] tracking-wider uppercase text-graphite/60 hover:border-cobalt hover:text-cobalt transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
