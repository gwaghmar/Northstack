/**
 * LeftSidebar component
 * Mode selection panel with theme toggle
 */

'use client';

import React from 'react';

export type AppMode = 'coach' | 'tutorial' | 'screenshare' | 'recording' | 'technical';

interface Mode {
  id: AppMode;
  icon: string;
  label: string;
  sub: string;
  badge?: string;
}

const MODES: Mode[] = [
  { id: 'coach',       icon: '🎯', label: 'Accent Coach',    sub: 'Live AI coaching',    badge: 'LIVE' },
  { id: 'tutorial',    icon: '📚', label: 'Tutorial',        sub: 'Guided lessons'                    },
  { id: 'screenshare', icon: '🖥️', label: 'Screen Share',    sub: 'Share & discuss'                   },
  { id: 'recording',   icon: '⏺',  label: 'Recording',       sub: 'Record session'                    },
  { id: 'technical',   icon: '🔧', label: 'Technician',      sub: 'Tech assistance'                   },
];

interface LeftSidebarProps {
  activeMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
  isCoachingActive: boolean;
  score: number;
}

export default function LeftSidebar({
  activeMode,
  onModeChange,
  theme,
  onThemeToggle,
  isCoachingActive,
  score,
}: LeftSidebarProps) {
  return (
    <div className="left-sidebar flex flex-col">
      {/* Section label */}
      <div className="px-3 pt-4 pb-2">
        <p style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', letterSpacing: '0.35em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Live Modes
        </p>
      </div>

      {/* Mode list */}
      <div className="flex-1 px-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            className={`mode-btn ${activeMode === mode.id ? 'active' : ''}`}
            onClick={() => onModeChange(mode.id)}
          >
            <span className="mode-icon">{mode.icon}</span>
            <span className="flex flex-col gap-0 min-w-0">
              <span style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {mode.label}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>
                {mode.sub}
              </span>
            </span>
            {mode.badge && (
              <span style={{
                marginLeft: 'auto',
                fontSize: '8px',
                fontFamily: 'JetBrains Mono',
                letterSpacing: '0.05em',
                padding: '1px 5px',
                borderRadius: '4px',
                background: 'rgba(15,244,198,0.12)',
                color: 'var(--text-accent)',
                border: '1px solid rgba(15,244,198,0.2)',
                flexShrink: 0,
              }}>
                {mode.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Session info (when active) */}
      {isCoachingActive && (
        <div style={{ margin: '8px', padding: '10px', background: 'var(--mint-dim)', borderRadius: '10px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <span className="rec-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--coral)', display: 'block' }} />
            <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: 'var(--coral)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Live Session</span>
          </div>
          {score > 0 && (
            <>
              <p style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '3px', fontFamily: 'JetBrains Mono' }}>Score</p>
              <div style={{ height: '3px', borderRadius: '3px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${score}%`, background: score >= 80 ? 'var(--mint)' : score >= 60 ? '#f59e0b' : 'var(--coral)', borderRadius: '3px', transition: 'width 0.8s ease' }} />
              </div>
              <p style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'var(--text-accent)', marginTop: '3px' }}>{score}%</p>
            </>
          )}
        </div>
      )}

      {/* Bottom: Theme toggle */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
          {theme === 'dark' ? 'Dark' : 'Light'}
        </span>
        <button
          onClick={onThemeToggle}
          className="btn-theme"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </div>
  );
}
