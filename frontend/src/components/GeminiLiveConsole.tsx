'use client';
/**
 * GeminiLiveConsole — main app shell.
 * Voice-first. No text overlays blocking the main area.
 * Chat input is in the control tray. Responses are audio.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { LiveAPIProvider, useLiveAPIContext } from '@/contexts/LiveAPIContext';
import { LiveClientOptions } from '@/lib/genai-types';
import ControlTray from '@/components/control-tray/ControlTray';
import SidePanel from '@/components/side-panel/SidePanel';
import { Altair } from '@/components/altair/Altair';
import Brain from '@/components/brain/Brain';
import FileUpload from '@/components/file-upload/FileUpload';
import StatusBar from '@/components/status-bar/StatusBar';
import LeftPanel from '@/components/left-panel/LeftPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import QuickStart from '@/components/quick-start/QuickStart';
import VoiceChips from '@/components/settings-dialog/VoiceChips';
import { VisualCanvas } from '@/components/visual-canvas/VisualCanvas';
import cn from 'classnames';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const apiOptions: LiveClientOptions = {
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '',
  apiVersion: 'v1alpha',
};

// ── Inner component — lives inside LiveAPIProvider so it can use the context ──
function AppContent({
  selectedRole,
  onRoleSelect,
  showConsole,
  onToggleConsole,
  theme,
  onToggleTheme,
}: {
  selectedRole: string | undefined;
  onRoleSelect: (r: string | undefined) => void;
  showConsole: boolean;
  onToggleConsole: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const { client, connected, connect } = useLiveAPIContext();

  const inputRef = useRef<HTMLInputElement>(null);
  const [chatInput, setChatInput] = useState('');
  const turnCountRef = useRef(0);
  const sessionStartRef = useRef(Date.now());

  // Files queued to send to Gemini on next connect
  const [pendingFiles, setPendingFiles] = useState<{ name: string; content: string }[]>([]);
  const pendingFilesRef = useRef(pendingFiles);
  useEffect(() => { pendingFilesRef.current = pendingFiles; }, [pendingFiles]);

  // Datasource drop zone state
  const [dragOver, setDragOver] = useState(false);
  const [dsUploading, setDsUploading] = useState(false);
  const [dsFile, setDsFile] = useState<string | null>(null);
  const dsInputRef = useRef<HTMLInputElement>(null);

  // Session history auto-save
  useEffect(() => {
    const onClose = () => {
      if (turnCountRef.current === 0) return;
      const sessionId = `session_${sessionStartRef.current}`;
      fetch(`${API_URL}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          title: selectedRole ? `${selectedRole} session` : 'General session',
          role: selectedRole || 'general',
          timestamp: new Date().toISOString(),
          turn_count: turnCountRef.current,
        }),
      }).catch(() => {});
      turnCountRef.current = 0;
      sessionStartRef.current = Date.now();
    };
    client.on('close', onClose);
    return () => { client.off('close', onClose); };
  }, [client, selectedRole]);

  // Auto-send pending files when connected
  useEffect(() => {
    if (!connected) return;
    const files = pendingFilesRef.current;
    if (files.length === 0) return;
    // Small delay so session is fully established
    const t = setTimeout(() => {
      files.forEach((f) => {
        client.send([{ text: `I'm sharing a file: "${f.name}"\n\n\`\`\`\n${f.content}\n\`\`\`\n\nPlease analyse and be ready to answer questions about it.` }]);
      });
      setPendingFiles([]);
    }, 800);
    return () => clearTimeout(t);
  }, [connected, client]);

  // Count turns from content events
  useEffect(() => {
    const onTurn = () => { turnCountRef.current += 1; };
    client.on('turncomplete', onTurn);
    return () => { client.off('turncomplete', onTurn); };
  }, [client]);

  const handleSend = useCallback(() => {
    const text = chatInput.trim();
    if (!text || !connected) return;
    setChatInput('');
    client.send([{ text }]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [chatInput, connected, client]);

  // Upload file from datasource zone and queue for Gemini
  const uploadAndQueue = useCallback(async (file: File) => {
    setDsUploading(true);
    try {
      // Upload to backend storage
      const form = new FormData();
      form.append('file', file);
      await fetch(`${API_URL}/storage/upload`, { method: 'POST', body: form }).catch(() => {});

      // Read content locally to send to Gemini
      const text = await file.text().catch(() => '');
      if (text) {
        if (connected) {
          client.send([{ text: `I'm sharing a file: "${file.name}"\n\n\`\`\`\n${text}\n\`\`\`\n\nPlease analyse and be ready to answer questions about it.` }]);
        } else {
          setPendingFiles((prev) => [...prev, { name: file.name, content: text }]);
        }
      }
      setDsFile(file.name);
    } finally {
      setDsUploading(false);
    }
  }, [connected, client]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadAndQueue(file);
  }, [uploadAndQueue]);

  const handleDsFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAndQueue(file);
    if (dsInputRef.current) dsInputRef.current.value = '';
  }, [uploadAndQueue]);

  return (
    <div className="app-shell">
      <ErrorBoundary section="Status Bar">
        <StatusBar
          theme={theme}
          onToggleTheme={onToggleTheme}
          showConsole={showConsole}
          onToggleConsole={onToggleConsole}
        />
      </ErrorBoundary>

      <div className="app-body">
        <ErrorBoundary section="Left Panel">
          <LeftPanel selectedRole={selectedRole} onRoleSelect={onRoleSelect} />
        </ErrorBoundary>

        <div className="streaming-console">
          <main>
            <div className="main-app-area">
              <ErrorBoundary section="Visualization">
                <Altair />
                <VisualCanvas />
              </ErrorBoundary>

              <video
                className={cn('stream', { hidden: !videoStream })}
                ref={videoRef}
                autoPlay
                playsInline
                style={{ transform: 'scaleX(-1)' }}
              />

              {/* Landing: quick-start cards */}
              {!connected && selectedRole !== 'analyst' && (
                <QuickStart
                  connected={connected}
                  onRoleSelect={(r) => onRoleSelect(r)}
                  onConnect={connect}
                />
              )}

              {/* Data Analyst: drag-and-drop upload zone */}
              {selectedRole === 'analyst' && (
                <div
                  className={cn('datasource-prompt', 'datasource-prompt--interactive', {
                    'datasource-prompt--dragover': dragOver,
                    'datasource-prompt--uploading': dsUploading,
                    'datasource-prompt--done': !!dsFile && !dsUploading,
                  })}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => !dsUploading && dsInputRef.current?.click()}
                >
                  <input
                    ref={dsInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.pdf,.txt,.json"
                    style={{ display: 'none' }}
                    onChange={handleDsFileInput}
                  />
                  <span className="material-symbols-outlined datasource-prompt__icon">
                    {dsUploading ? 'sync' : dsFile ? 'check_circle' : 'upload_file'}
                  </span>
                  <div className="datasource-prompt__title">
                    {dsUploading ? 'Uploading…' : dsFile ? dsFile : 'Drop a file or click to upload'}
                  </div>
                  <div className="datasource-prompt__sub">
                    {dsFile
                      ? connected ? 'Sent to Gemini. Ask anything about it.' : 'Will be sent to Gemini when you connect.'
                      : 'CSV, Excel, PDF, TXT, JSON — Gemini will analyze it instantly'}
                  </div>
                  {dsFile && !dsUploading && (
                    <button
                      className="datasource-prompt__clear"
                      onClick={(e) => { e.stopPropagation(); setDsFile(null); setPendingFiles([]); }}
                    >
                      Upload different file
                    </button>
                  )}
                </div>
              )}

              {/* Pending files badge — shown when files queued but not yet connected */}
              {pendingFiles.length > 0 && !connected && (
                <div className="pending-files-badge">
                  <span className="material-symbols-outlined">attach_file</span>
                  {pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''} will be sent when you connect
                </div>
              )}
            </div>

            {/* ControlTray */}
            <ErrorBoundary section="Controls">
              <ControlTray
                videoRef={videoRef}
                supportsVideo={true}
                onVideoStreamChange={setVideoStream}
                enableEditingSettings={true}
              >
                <div className="chat-inline">
                  <input
                    ref={inputRef}
                    className="chat-inline__input"
                    placeholder={connected ? 'Type a message…' : 'Connect to chat'}
                    value={chatInput}
                    disabled={!connected}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
                    }}
                  />
                  <button
                    className="chat-inline__send"
                    onClick={handleSend}
                    disabled={!connected || !chatInput.trim()}
                    title="Send"
                  >
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </div>
                <FileUpload />
              </ControlTray>
            </ErrorBoundary>

            {/* Voice selector bar */}
            <div className="voice-bar">
              <VoiceChips />
            </div>
          </main>
        </div>

        {showConsole && (
          <ErrorBoundary section="Console">
            <SidePanel />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

// ── Outer shell ──────────────────────────────────────────────────────────────
export default function GeminiLiveConsole() {
  const [selectedRole, setSelectedRole] = useState<string | undefined>(undefined);
  const [showConsole, setShowConsole] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    document.title = 'Northstack';
    const saved = (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <LiveAPIProvider options={apiOptions}>
      <Brain role={selectedRole} />
      <AppContent
        selectedRole={selectedRole}
        onRoleSelect={setSelectedRole}
        showConsole={showConsole}
        onToggleConsole={() => setShowConsole((v) => !v)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    </LiveAPIProvider>
  );
}
