/**
 * FeedbackPanel component
 * Displays coaching feedback in a floating HUD card
 */

'use client';

import React from 'react';
import { CoachingResponse } from '../types';

interface FeedbackPanelProps {
  response: CoachingResponse | null;
  isLoading: boolean;
}

const ScoreRing = ({ score }: { score: number }) => {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const fill = circ - (score / 100) * circ;
  const color = score >= 80 ? '#0ff4c6' : score >= 60 ? '#f59e0b' : '#ff5c35';

  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle className="score-ring-track" cx="36" cy="36" r={r} />
      <circle
        className="score-ring-fill"
        cx="36"
        cy="36"
        r={r}
        stroke={color}
        strokeDasharray={circ}
        strokeDashoffset={fill}
        transform="rotate(-90 36 36)"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
      <text
        x="36"
        y="36"
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize="14"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="700"
      >
        {score}
      </text>
    </svg>
  );
};

export default function FeedbackPanel({ response, isLoading }: FeedbackPanelProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-[#0ff4c6]/10" />
          <div className="absolute inset-0 rounded-full border-2 border-[#0ff4c6] border-t-transparent animate-spin" />
        </div>
        <p className="text-[9px] font-mono tracking-[0.35em] text-[#0ff4c6]/50 uppercase animate-pulse">
          Analyzing Phonetics
        </p>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-30">
        <div className="text-3xl">◎</div>
        <p className="text-[10px] font-mono tracking-[0.2em] uppercase text-center text-white/50 leading-loose">
          Start session to receive<br />real-time coaching
        </p>
      </div>
    );
  }

  const score = response.accuracyScore || 0;

  return (
    <div className="space-y-5 animate-in">
      {/* Score + level */}
      {score > 0 && (
        <div className="hud-inset p-4 flex items-center gap-4">
          <ScoreRing score={score} />
          <div className="flex-1">
            <p className="text-[9px] font-mono tracking-[0.3em] text-white/30 uppercase mb-1">Authenticity</p>
            <p className="text-2xl font-display text-white leading-none">{score}<span className="text-sm font-mono text-white/40">%</span></p>
            <div className={`inline-flex mt-2 px-2 py-0.5 rounded text-[9px] font-mono tracking-wider uppercase ${
              score >= 80
                ? 'bg-[#0ff4c6]/10 text-[#0ff4c6] border border-[#0ff4c6]/20'
                : score >= 60
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-[#ff5c35]/10 text-[#ff5c35] border border-[#ff5c35]/20'
            }`}>
              {score >= 80 ? 'Master' : score >= 60 ? 'Developing' : 'Novice'}
            </div>
          </div>
        </div>
      )}

      {/* Transcript */}
      {response.transcript && (
        <div className="px-1">
          <p className="text-[9px] font-mono tracking-[0.3em] uppercase text-white/25 mb-2">You said</p>
          <p className="text-sm font-light text-white/80 leading-relaxed italic border-l border-[#0ff4c6]/30 pl-3">
            "{response.transcript}"
          </p>
        </div>
      )}

      {/* Lumina's feedback */}
      {(response.feedback || response.text) && (
        <div className="hud-inset p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#0ff4c6] shadow-[0_0_6px_#0ff4c6]" />
            <p className="text-[9px] font-mono tracking-[0.3em] uppercase text-[#0ff4c6]/60">Lumina</p>
          </div>
          <p className="text-xs font-light text-white/70 leading-loose">
            {response.feedback || response.text}
          </p>
        </div>
      )}

      {/* Corrections */}
      {response.corrections && response.corrections.length > 0 && (
        <div className="hud-inset p-4 border-l-2 border-[#ff5c35]/40">
          <p className="text-[9px] font-mono tracking-[0.3em] uppercase text-[#ff5c35]/70 mb-3">Corrections</p>
          <div className="space-y-2">
            {response.corrections.map((c, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs text-white/60">
                <span className="flex-none mt-1 w-1 h-1 rounded-full bg-[#ff5c35]" />
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {response.tips && response.tips.length > 0 && (
        <div className="hud-inset p-4 border-l-2 border-[#0ff4c6]/30">
          <p className="text-[9px] font-mono tracking-[0.3em] uppercase text-[#0ff4c6]/60 mb-3">Techniques</p>
          <div className="space-y-2">
            {response.tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs text-white/60">
                <span className="flex-none mt-0.5 text-[#0ff4c6] text-[10px]">→</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
