import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function SlideDeck({ slides, index: controlledIndex, onIndexChange, showNotes = true }) {
  const [localIndex, setLocalIndex] = useState(0);
  const index = controlledIndex ?? localIndex;
  const total = slides.length;
  const slide = slides[Math.min(index, total - 1)] || { heading: "", bullets: [] };

  function go(next) {
    const clamped = Math.max(0, Math.min(total - 1, next));
    if (onIndexChange) onIndexChange(clamped);
    else setLocalIndex(clamped);
  }

  useEffect(() => {
    function onKey(e) {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) return;
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!total) return null;

  return (
    <div className="space-y-4">
      <div className="relative aspect-[16/9] rounded-xl bg-graphite text-white overflow-hidden">
        <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-16 py-10">
          <p className="font-mono text-[10px] tracking-[0.4em] uppercase text-mint mb-4">
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </p>
          <h2 className={`font-heading font-bold italic leading-tight ${index === 0 ? "text-3xl md:text-5xl" : "text-2xl md:text-4xl"}`}>
            {slide.heading}
          </h2>
          {slide.bullets?.length > 0 && (
            <ul className="mt-6 md:mt-8 space-y-2 md:space-y-3">
              {slide.bullets.map((bullet, i) => (
                <li key={i} className="flex gap-3 font-body text-sm md:text-lg text-white/80 leading-snug">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-cobalt shrink-0" />
                  {bullet}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="absolute bottom-0 left-0 h-1 bg-cobalt transition-all duration-500" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-graphite/50 hover:text-cobalt disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Slide ${i + 1}`}
              className={`w-2 h-2 rounded-full transition-colors ${i === index ? "bg-cobalt" : "bg-graphite/15 hover:bg-graphite/30"}`}
            />
          ))}
        </div>
        <button
          onClick={() => go(index + 1)}
          disabled={index >= total - 1}
          className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-graphite/50 hover:text-cobalt disabled:opacity-30"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {showNotes && (slide.notes || slide.narration) && (
        <div className="rounded-lg border border-graphite/10 bg-white p-4">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-graphite/35 mb-2">
            {slide.narration ? "Narration" : "Speaker notes"}
          </p>
          <p className="font-body text-sm text-graphite/70 leading-relaxed">{slide.notes || slide.narration}</p>
        </div>
      )}
    </div>
  );
}
