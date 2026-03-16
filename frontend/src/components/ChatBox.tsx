/**
 * ChatBox component
 * Chat messages area + input below the camera
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'system';
  text: string;
  ts: number;
}

interface ChatBoxProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  isConnected: boolean;
  isCoachingActive: boolean;
}

export default function ChatBox({ messages, onSend, isConnected, isCoachingActive }: ChatBoxProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !isConnected) return;
    onSend(text);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="chat-section">
      {/* Header */}
      <div style={{
        flexShrink: 0,
        padding: '7px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', letterSpacing: '0.3em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Chat
        </span>
        {isCoachingActive && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '9px',
            fontFamily: 'JetBrains Mono',
            color: 'var(--text-accent)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}>
            ● Lumina listening
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>
            {isConnected ? 'Start the session to chat with Lumina AI...' : 'Connecting to server...'}
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-msg ${msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'ai'}`}
            >
              {msg.role !== 'system' && (
                <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '5px', marginBottom: '3px', alignItems: 'center' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                    {msg.role === 'user' ? 'You' : 'Lumina'} · {fmtTime(msg.ts)}
                  </span>
                </div>
              )}
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>{msg.text}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="chat-input-bar">
        <input
          className="chat-input"
          type="text"
          placeholder={isConnected ? 'Ask Lumina anything...' : 'Waiting for connection...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isConnected}
          maxLength={500}
        />
        <button
          className="btn-send"
          onClick={handleSend}
          disabled={!isConnected || !input.trim()}
          title="Send message"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 21l21-9-21-9v7l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
