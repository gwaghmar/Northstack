/**
 * DirectChat
 * Clean direct Gemini Live conversation via ADK backend.
 *
 * Audio flow:
 *   Mic → AudioWorklet (pcm-recorder-processor) → binary WS frames → ADK → Gemini
 *   Gemini → ADK events (JSON, inlineData base64) → AudioWorklet ring buffer → speakers
 */

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { WS_URL } from '../utils/constants';
import { useAudioStream } from '../hooks/useAudioStream';
import { useGeminiAudioPlayback } from '../hooks/useGeminiAudioPlayback';

interface Message {
  id: string;
  role: 'user' | 'ai' | 'system';
  text: string;
  ts: number;
  partial?: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 9);

/** Decode base64 string → ArrayBuffer (handles base64url too) */
function b64ToBuffer(b64: string): ArrayBuffer {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export default function DirectChat() {
  const wsRef          = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isConnected,    setIsConnected]    = useState(false);
  const [isMicOn,        setIsMicOn]        = useState(false);
  const [isAiSpeaking,   setIsAiSpeaking]   = useState(false);
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [inputText,      setInputText]      = useState('');

  // Per-turn transcription state (mirrors ADK bidi-demo logic)
  const inTranscriptRef  = useRef<{ id: string; partial: string } | null>(null);
  const outTranscriptRef = useRef<{ id: string; partial: string } | null>(null);

  const { playPcmChunk, stopPlayback } = useGeminiAudioPlayback();

  // ── helpers ───────────────────────────────────────────────────
  function addMsg(role: Message['role'], text: string, id?: string): string {
    const msgId = id ?? uid();
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msgId);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], text, partial: false };
        return updated;
      }
      return [...prev, { id: msgId, role, text, ts: Date.now() }];
    });
    return msgId;
  }

  function upsertMsg(id: string, role: Message['role'], text: string, partial: boolean) {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === id);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], text, partial };
        return updated;
      }
      return [...prev, { id, role, text, ts: Date.now(), partial }];
    });
  }

  // ── ADK event handler ─────────────────────────────────────────
  const handleAdkEvent = useCallback((raw: string) => {
    let evt: Record<string, any>;
    try { evt = JSON.parse(raw); } catch { return; }

    // ── Audio output ──────────────────────────────────────────
    if (evt.content?.parts) {
      for (const part of evt.content.parts as any[]) {
        if (part.inlineData?.mimeType?.startsWith('audio/pcm')) {
          setIsAiSpeaking(true);
          playPcmChunk(b64ToBuffer(part.inlineData.data));
        }
      }
    }

    // ── Input transcription (user speech → text) ──────────────
    if (evt.inputTranscription?.text) {
      const { text, finished } = evt.inputTranscription as { text: string; finished?: boolean };
      if (!inTranscriptRef.current) {
        const id = uid();
        inTranscriptRef.current = { id, partial: text };
        upsertMsg(id, 'user', text, !finished);
      } else {
        const { id } = inTranscriptRef.current;
        const next = finished ? text : inTranscriptRef.current.partial + text;
        inTranscriptRef.current.partial = next;
        upsertMsg(id, 'user', next, !finished);
      }
      if (finished) inTranscriptRef.current = null;
    }

    // ── Output transcription (Gemini speech → text) ───────────
    if (evt.outputTranscription?.text) {
      const { text, finished } = evt.outputTranscription as { text: string; finished?: boolean };
      if (!outTranscriptRef.current) {
        const id = uid();
        outTranscriptRef.current = { id, partial: text };
        upsertMsg(id, 'ai', text, !finished);
      } else {
        const { id } = outTranscriptRef.current;
        const next = finished ? text : outTranscriptRef.current.partial + text;
        outTranscriptRef.current.partial = next;
        upsertMsg(id, 'ai', next, !finished);
      }
      if (finished) outTranscriptRef.current = null;
    }

    // ── Turn complete ─────────────────────────────────────────
    if (evt.turnComplete) {
      setIsAiSpeaking(false);
      inTranscriptRef.current  = null;
      outTranscriptRef.current = null;
    }

    // ── Interrupted ───────────────────────────────────────────
    if (evt.interrupted) {
      setIsAiSpeaking(false);
      // Signal worklet to flush ring buffer
      stopPlayback();
      outTranscriptRef.current = null;
    }
  }, [playPcmChunk, stopPlayback]);

  // ── WebSocket connect / reconnect ─────────────────────────────
  const connectWs = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/ws/direct`);

    ws.onopen = () => {
      setIsConnected(true);
      addMsg('system', 'Connected — say something or type below');
    };

    ws.onmessage = (e: MessageEvent) => {
      if (typeof e.data === 'string') handleAdkEvent(e.data);
    };

    ws.onerror = () => setIsConnected(false);

    ws.onclose = () => {
      setIsConnected(false);
      inTranscriptRef.current  = null;
      outTranscriptRef.current = null;
      // Reconnect after 3 s
      setTimeout(connectWs, 3000);
    };

    wsRef.current = ws;
  }, [handleAdkEvent]);

  useEffect(() => {
    connectWs();
    return () => { wsRef.current?.close(); stopPlayback(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Mic / audio stream ────────────────────────────────────────
  const sendBinaryRef = useRef<(data: Uint8Array) => void>(() => {});

  // Keep the send function current
  useEffect(() => {
    sendBinaryRef.current = (chunk: Uint8Array) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(chunk.buffer as ArrayBuffer);
      }
    };
  }, []);

  const { isStreaming, startStream, stopStream, volume } = useAudioStream(
    useCallback((chunk: Uint8Array) => sendBinaryRef.current(chunk), [])
  );

  const handleMicToggle = async () => {
    if (isMicOn) { stopStream(); setIsMicOn(false); }
    else         { await startStream(); setIsMicOn(true); }
  };

  // ── Text send ─────────────────────────────────────────────────
  const handleSend = () => {
    const text = inputText.trim();
    if (!text || !isConnected) return;
    wsRef.current?.send(JSON.stringify({ type: 'text', text }));
    addMsg('user', text);
    setInputText('');
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-primary)', color: 'var(--text-primary)',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 18px', borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0, background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-accent)', letterSpacing: '0.06em' }}>
            Gemini Live
          </span>
          <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Direct · ADK
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Connected chip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '3px 10px', borderRadius: '7px',
            background: isConnected ? 'rgba(15,244,198,0.07)' : 'rgba(255,92,53,0.07)',
            border: `1px solid ${isConnected ? 'rgba(15,244,198,0.2)' : 'rgba(255,92,53,0.2)'}`,
          }}>
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: isConnected ? 'var(--mint)' : 'var(--coral)',
              boxShadow: isConnected ? '0 0 5px var(--mint)' : 'none',
              animation: isConnected ? 'pulse-dot 2s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: isConnected ? 'var(--text-accent)' : 'var(--coral)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              {isConnected ? 'Live' : 'Connecting...'}
            </span>
          </div>

          {/* Speaking chip */}
          {isAiSpeaking && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '3px 10px', borderRadius: '7px',
              background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)',
            }}>
              <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '12px' }}>
                {[3,6,4,8,5,3].map((h, i) => (
                  <div key={i} style={{
                    width: '2px', height: `${h}px`, borderRadius: '1px',
                    background: 'rgb(139,92,246)',
                    animation: `wave-bar 0.5s ease-in-out ${i * 0.08}s infinite alternate`,
                  }} />
                ))}
              </div>
              <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: 'rgb(139,92,246)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                Speaking
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '10px',
      }}>
        {messages.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '14px', marginTop: '80px', opacity: 0.4,
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.3))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '26px',
            }}>✨</div>
            <p style={{ fontSize: '12px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.1em', textAlign: 'center' }}>
              Connecting to Gemini Live...
            </p>
          </div>
        )}

        {messages.map(msg => {
          if (msg.role === 'system') {
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{
                  fontSize: '10px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)',
                  padding: '3px 10px', borderRadius: '20px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)',
                  letterSpacing: '0.12em',
                }}>
                  {msg.text}
                </span>
              </div>
            );
          }

          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} style={{
              display: 'flex',
              justifyContent: isUser ? 'flex-end' : 'flex-start',
              alignItems: 'flex-end', gap: '8px',
            }}>
              {!isUser && (
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, rgb(139,92,246), rgb(59,130,246))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
                }}>✨</div>
              )}
              <div style={{
                maxWidth: '75%', padding: '10px 14px',
                borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: isUser
                  ? 'linear-gradient(135deg, rgba(15,244,198,0.12), rgba(15,244,198,0.06))'
                  : 'rgba(255,255,255,0.05)',
                border: isUser ? '1px solid rgba(15,244,198,0.2)' : '1px solid var(--border-subtle)',
                fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)',
                opacity: msg.partial ? 0.75 : 1,
                transition: 'opacity 0.15s ease',
              }}>
                {msg.text}
                {msg.partial && (
                  <span style={{ display: 'inline-block', marginLeft: '4px', opacity: 0.5 }}>
                    <span style={{ animation: 'blink 1s step-end infinite' }}>▋</span>
                  </span>
                )}
              </div>
              {isUser && (
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(15,244,198,0.1)', border: '1px solid rgba(15,244,198,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
                }}>👤</div>
              )}
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input bar ── */}
      <div style={{
        padding: '10px 14px', borderTop: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: '8px',
        background: 'var(--bg-secondary)', flexShrink: 0,
      }}>

        {/* Mic button */}
        <button
          onClick={handleMicToggle}
          title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
          style={{
            width: '40px', height: '40px', borderRadius: '50%', border: 'none',
            flexShrink: 0, cursor: 'pointer', transition: 'all 0.2s ease',
            background: isMicOn
              ? 'linear-gradient(135deg, var(--mint), rgba(15,244,198,0.7))'
              : 'rgba(255,255,255,0.06)',
            color: isMicOn ? '#000' : 'var(--text-muted)',
            boxShadow: isMicOn ? '0 0 14px rgba(15,244,198,0.35)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {isMicOn ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="9" y="2" width="6" height="11" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0M12 19v3M9 22h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .36-.03.72-.08 1.06M12 19v3M9 22h6"/>
            </svg>
          )}
        </button>

        {/* Volume bars */}
        {isMicOn && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '20px', flexShrink: 0 }}>
            {[...Array(7)].map((_, i) => {
              const active = i < Math.round((volume / 100) * 7);
              return (
                <div key={i} style={{
                  width: '3px', borderRadius: '2px',
                  height: `${active ? Math.max(4, Math.min(18, 4 + (volume / 100) * 14)) : 4}px`,
                  background: active ? 'var(--mint)' : 'rgba(255,255,255,0.1)',
                  transition: 'height 0.05s ease',
                }} />
              );
            })}
          </div>
        )}

        {/* Text input */}
        <input
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={isConnected ? 'Type a message... (Enter to send)' : 'Connecting...'}
          disabled={!isConnected}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border-subtle)', borderRadius: '22px',
            padding: '10px 16px', color: 'var(--text-primary)', fontSize: '14px',
            outline: 'none', transition: 'border-color 0.2s ease',
            fontFamily: 'Inter, sans-serif',
          }}
          onFocus={e  => { e.currentTarget.style.borderColor = 'rgba(15,244,198,0.3)'; }}
          onBlur={e   => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!isConnected || !inputText.trim()}
          style={{
            width: '40px', height: '40px', borderRadius: '50%', border: 'none',
            flexShrink: 0, cursor: inputText.trim() && isConnected ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
            background: inputText.trim() && isConnected
              ? 'linear-gradient(135deg, var(--mint), rgba(15,244,198,0.7))'
              : 'rgba(255,255,255,0.04)',
            color: inputText.trim() && isConnected ? '#000' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22,2 15,22 11,13 2,9"/>
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes wave-bar {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1.6); }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
