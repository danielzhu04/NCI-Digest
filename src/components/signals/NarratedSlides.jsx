import React, { useRef, useState } from "react";
import SlideDeck from "@/components/signals/SlideDeck";

// Plays the voice-over and keeps the visible slide in step with each scene's start_ms.
export default function NarratedSlides({ slides, audioUrl }) {
  const audioRef = useRef(null);
  const [index, setIndex] = useState(0);

  function sceneAt(ms) {
    let current = 0;
    slides.forEach((slide, i) => {
      if (typeof slide.start_ms === "number" && slide.start_ms <= ms) current = i;
    });
    return current;
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    const next = sceneAt(audio.currentTime * 1000);
    if (next !== index) setIndex(next);
  }

  function jumpTo(i) {
    setIndex(i);
    const audio = audioRef.current;
    const start = slides[i]?.start_ms;
    if (audio && typeof start === "number") audio.currentTime = start / 1000;
  }

  return (
    <div className="space-y-4">
      <SlideDeck slides={slides} index={index} onIndexChange={jumpTo} />
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={audioUrl}
        onTimeUpdate={onTimeUpdate}
        onSeeked={onTimeUpdate}
        className="w-full"
      >
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}
