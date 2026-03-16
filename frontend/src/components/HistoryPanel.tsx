/**
 * HistoryPanel component
 * Right-side session history & intelligence feed
 */

'use client';

import React from 'react';
import { CoachingResponse } from '../types';
import FeedbackPanel from './FeedbackPanel';

export interface HistoryEntry {
  id: string;
  ts: number;
  transcript: string;
  score: number;
  corrections: string[];
  tips: string[];
}

interface HistoryPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  currentFeedback: CoachingResponse | null;
  isLoading: boolean;
  history: HistoryEntry[];
}

export default function HistoryPanel({
  collapsed,
  onToggle,
  currentFeedback,
  isLoading,
  history,
}: HistoryPanelProps) {
  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="right-panel" style={{ width: collapsed ? '40px' : '260px' }}>
      {/* Toggle button */}
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '0' : '0 12px',
          border: 'none',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.2s ease',
        }}
      >
        {!collapsed && (
          <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', letterSpacing: '0.3em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Intelligence
          </span>
        )}
        <span style={{ fontSize: '14px', opacity: 0.5 }}>{collapsed ? '‹' : '›'}</span>
      </button>

      {!collapsed && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Live Feedback */}
          <div style={{ padding: '10px 10px 6px', flex: '0 0 auto' }}>
            <p style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', letterSpacing: '0.3em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
              Live Feedback
            </p>
            <div style={{ maxHeight: '280px', overflowY: 'auto' }} className="custom-scrollbar">
              <FeedbackPanel response={currentFeedback} isLoading={isLoading} />
            </div>
          </div>

          {/* Divider */}
          {history.length > 0 && (
            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '0 10px' }} />
          )}

          {/* Session history */}
          {history.length > 0 && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', letterSpacing: '0.3em', color: 'var(--text-muted)', textTransform: 'uppercase', padding: '8px 10px 4px' }}>
                History ({history.length})
              </p>
              <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
                {[...history].reverse().map((entry) => (
                  <div key={entry.id} className="history-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>
                        {fmtTime(entry.ts)}
                      </span>
                      {entry.score > 0 && (
                        <span style={{
                          fontSize: '10px',
                          fontFamily: 'JetBrains Mono',
                          fontWeight: 700,
                          color: entry.score >= 80 ? 'var(--mint)' : entry.score >= 60 ? '#f59e0b' : 'var(--coral)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background: entry.score >= 80 ? 'var(--mint-dim)' : entry.score >= 60 ? 'rgba(245,158,11,0.1)' : 'var(--coral-dim)',
                        }}>
                          {entry.score}%
                        </span>
                      )}
                    </div>
                    {entry.transcript && (
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        "{entry.transcript}"
                      </p>
                    )}
                    {entry.corrections.length > 0 && (
                      <p style={{ fontSize: '10px', color: 'var(--coral)', marginTop: '3px', fontFamily: 'JetBrains Mono' }}>
                        {entry.corrections.length} correction{entry.corrections.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {history.length === 0 && !currentFeedback && !isLoading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic', lineHeight: 1.6 }}>
                Session history will appear here as you practice
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
