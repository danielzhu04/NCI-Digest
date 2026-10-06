import React from "react";
import { Film, Headphones, Mic, Presentation } from "lucide-react";

const ICONS = {
  podcast: Headphones,
  ted_talk: Mic,
  slides: Presentation,
  video: Film,
};

export default function MediumIcon({ medium, className = "w-4 h-4" }) {
  const Icon = ICONS[medium] || Headphones;
  return <Icon className={className} aria-hidden="true" />;
}
