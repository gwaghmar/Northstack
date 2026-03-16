/**
 * CoachSession component
 * Main app layout: left sidebar + camera + chat + right history panel
 */

'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import VideoCanvas from './VideoCanvas';
import ChatBox, { ChatMessage } from './ChatBox';
import LeftSidebar, { AppMode } from './LeftSidebar';
import HistoryPanel, { HistoryEntry } from './HistoryPanel';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAudioStream } from '../hooks/useAudioStream';
import { useHandGesture } from '../hooks/useHandGesture';
import { useGeminiAudioPlayback } from '../hooks/useGeminiAudioPlayback';
import { CoachingResponse } from '../types';

// ── Helpers ─────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ── Component ────────────────────────────────────────────────────
export default function CoachSession() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioChunksRef = useRef<Uint8Array[]>([]);
  const audioBytesTotalRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // ── App state ────────────────────────────────────────────────
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeMode, setActiveMode] = useState<AppMode>('coach');
  const [historyCollapsed, setHistoryCollapsed] = useState(false);

  // ── Session state ────────────────────────────────────────────
  const [isCoachingActive, setIsCoachingActive] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSaved, setRecordingSaved] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [showTracking, setShowTracking] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [sessionTime, setSessionTime] = useState(0);
  const [audioSeconds, setAudioSeconds] = useState(0);
  const [gestureReaction, setGestureReaction] = useState<'up' | 'down' | null>(null);

  // ── Data state ───────────────────────────────────────────────
  const [feedback, setFeedback] = useState<CoachingResponse | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // ── OpenClaw state ───────────────────────────────────────────
  const [openclawAvailable, setOpenclawAvailable] = useState<boolean | null>(null);
  const [openclawLoading, setOpenclawLoading] = useState(false);

  // ── Hooks ────────────────────────────────────────────────────
  const { faceLandmarks, handLandmarks, isReady: isMediaPipeReady, error: mediaPipeError } = useMediaPipe(videoRef);
  const { gesture, isThumbsUp, isThumbsDown } = useHandGesture(handLandmarks);
  const {
    isConnected: wsConnected,
    lastResponse,
    sendAudioChunk,
    sendImageFrame,
    sendText,
    sendModeSwitch,
    endSession,
    setAudioBytesHandler,
  } = useWebSocket();
  const { playPcmChunk } = useGeminiAudioPlayback();

  // ── OpenClaw availability check on mount ─────────────────────
  useEffect(() => {
    fetch('http://localhost:8000/openclaw/status')
      .then(r => r.json())
      .then(d => setOpenclawAvailable(d.available === true))
      .catch(() => setOpenclawAvailable(false));
  }, []);

  // ── Theme persistence ─────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('lumina-theme') as 'dark' | 'light' | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lumina-theme', theme);
  }, [theme]);

  // ── Route Gemini audio → playback ────────────────────────────
  useEffect(() => {
    setAudioBytesHandler(playPcmChunk);
  }, [setAudioBytesHandler, playPcmChunk]);

  // ── Camera stream ref (so we can stop/start it independently) ─
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const startCameraStream = useCallback(async () => {
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraError(null);
    } catch (err) {
      setCameraError(`Camera unavailable: ${err}`);
    }
  }, []);

  const stopCameraStream = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Start camera once MediaPipe is ready
  useEffect(() => {
    if (!isMediaPipeReady || isScreenSharing) return;
    if (cameraOn) {
      startCameraStream();
    } else {
      stopCameraStream();
    }
    return () => {
      if (!isScreenSharing) stopCameraStream();
    };
  }, [isMediaPipeReady, isScreenSharing, cameraOn]);

  // Camera on/off toggle handler
  const handleCameraToggle = useCallback(() => {
    setCameraOn(prev => {
      if (prev) stopCameraStream();
      else startCameraStream();
      return !prev;
    });
  }, [startCameraStream, stopCameraStream]);

  // ── Audio stream — use ref so callback never goes stale ──────
  const isCoachingActiveRef = useRef(isCoachingActive);
  useEffect(() => { isCoachingActiveRef.current = isCoachingActive; }, [isCoachingActive]);
  const sendAudioChunkRef = useRef(sendAudioChunk);
  useEffect(() => { sendAudioChunkRef.current = sendAudioChunk; }, [sendAudioChunk]);

  const { isStreaming: isAudioStreaming, startStream, stopStream, volume } = useAudioStream(
    useCallback((chunk: Uint8Array) => {
      if (isCoachingActiveRef.current) {
        audioChunksRef.current.push(chunk);
        audioBytesTotalRef.current += chunk.length;
        sendAudioChunkRef.current(chunk);
      }
    }, []) // stable — reads from refs
  );

  // ── Session timer + audio usage tracker ──────────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isCoachingActive) {
      setSessionTime(0);
      setAudioSeconds(0);
      timer = setInterval(() => {
        setSessionTime(t => t + 1);
        if (isAudioStreaming) setAudioSeconds(a => a + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isCoachingActive, isAudioStreaming]);

  // ── Gesture triggers ─────────────────────────────────────────
  useEffect(() => {
    if (isThumbsUp && gesture.holdDuration >= 500 && !isCoachingActive) {
      setGestureReaction('up');
      setTimeout(() => setGestureReaction(null), 1800);
      handleStartCoaching();
    } else if (isThumbsDown && gesture.holdDuration >= 500 && isCoachingActive) {
      setGestureReaction('down');
      setTimeout(() => setGestureReaction(null), 1800);
      handleStopCoaching();
    }
  }, [isThumbsUp, isThumbsDown, gesture.holdDuration, isCoachingActive]);

  // ── WebSocket responses ──────────────────────────────────────
  useEffect(() => {
    if (!lastResponse) return;
    if (lastResponse.type === 'visual_aid') return;
    if ((lastResponse.type as string) === 'mode_switched') return;

    // Brain response — show in chat with 🧠 prefix
    if ((lastResponse.type as string) === 'brain_response') {
      const brainText = lastResponse.text;
      if (brainText) {
        setChatMessages(prev => [...prev, {
          id: uid(), role: 'ai',
          text: brainText,
          ts: Date.now(),
        }]);
      }
      return;
    }

    setFeedback(lastResponse);
    setIsLoading(false);

    // Add AI message to chat
    const aiText = lastResponse.feedback || lastResponse.text || lastResponse.transcript;
    if (aiText) {
      setChatMessages(prev => [...prev, {
        id: uid(),
        role: 'ai',
        text: aiText,
        ts: Date.now(),
      }]);
    }

    // Add to history if has transcript + score
    if (lastResponse.transcript || lastResponse.accuracyScore) {
      setHistory(prev => [...prev, {
        id: uid(),
        ts: Date.now(),
        transcript: lastResponse.transcript || '',
        score: lastResponse.accuracyScore || 0,
        corrections: lastResponse.corrections || [],
        tips: lastResponse.tips || [],
      }]);
    }
  }, [lastResponse]);

  // ── Video frame capture (1 FPS) ──────────────────────────────
  useEffect(() => {
    if (!isCoachingActive || !wsConnected) return;
    const captureFrame = () => {
      if (!videoRef.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (!isScreenSharing) {
          ctx.save(); ctx.scale(-1, 1);
          ctx.drawImage(videoRef.current, -canvas.width, 0);
          ctx.restore();
        } else {
          ctx.drawImage(videoRef.current, 0, 0);
        }
        sendImageFrame(canvas.toDataURL('image/jpeg', 0.6));
      }
    };
    captureFrame();
    const iv = setInterval(captureFrame, 1000);
    return () => clearInterval(iv);
  }, [isCoachingActive, wsConnected, sendImageFrame, isScreenSharing]);

  // ── Mode switch side-effects ──────────────────────────────────
  useEffect(() => {
    if (activeMode === 'screenshare') {
      startScreenShare();
    } else {
      stopScreenShare();
    }
  }, [activeMode]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleStartCoaching = async () => {
    setIsCoachingActive(true);
    setIsLoading(true);
    setIsMicEnabled(true);
    setFeedback(null);
    audioChunksRef.current = [];
    audioBytesTotalRef.current = 0;
    setChatMessages(prev => [...prev, {
      id: uid(), role: 'system', text: '— Session started —', ts: Date.now(),
    }]);
    if (!isAudioStreaming) await startStream();
  };

  const handleStopCoaching = () => {
    setIsCoachingActive(false);
    setIsMicEnabled(false);
    stopStream();

    const totalLength = audioBytesTotalRef.current;
    let finalAudio: Uint8Array | undefined;
    if (totalLength > 0) {
      finalAudio = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunksRef.current) {
        finalAudio.set(chunk, offset);
        offset += chunk.length;
      }
    }
    endSession(finalAudio);
    audioChunksRef.current = [];
    audioBytesTotalRef.current = 0;
    setChatMessages(prev => [...prev, {
      id: uid(), role: 'system', text: '— Session ended —', ts: Date.now(),
    }]);
  };

  const handleMicToggle = () => {
    if (isMicEnabled) { stopStream(); setIsMicEnabled(false); }
    else { startStream(); setIsMicEnabled(true); }
  };

  const handleSendChat = (text: string) => {
    setChatMessages(prev => [...prev, { id: uid(), role: 'user', text, ts: Date.now() }]);
    sendText(text);
  };

  const handleAskOpenClaw = async () => {
    if (!openclawAvailable || openclawLoading) return;
    setOpenclawLoading(true);

    // Build context from recent chat + latest feedback
    const recentMessages = chatMessages.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));
    const context = feedback
      ? `Latest coaching feedback: ${feedback.feedback || ''}. Score: ${feedback.accuracyScore || 0}%. Corrections: ${(feedback.corrections || []).join(', ')}`
      : 'No coaching feedback yet.';

    try {
      const res = await fetch('http://localhost:8000/openclaw/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: recentMessages.length > 0 ? recentMessages : [{ role: 'user', content: 'Analyze my coaching session so far.' }],
          context,
        }),
      });
      const data = await res.json();
      if (data.content) {
        setChatMessages(prev => [...prev, {
          id: uid(), role: 'ai',
          text: `🦞 OpenClaw: ${data.content}`,
          ts: Date.now(),
        }]);
      }
    } catch {
      setChatMessages(prev => [...prev, {
        id: uid(), role: 'system',
        text: '⚠ OpenClaw unavailable',
        ts: Date.now(),
      }]);
    } finally {
      setOpenclawLoading(false);
    }
  };

  const startScreenShare = async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsScreenSharing(true);
      }
      stream.getVideoTracks()[0].addEventListener('ended', stopScreenShare);
    } catch {
      setActiveMode('coach');
    }
  };

  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setIsScreenSharing(false);
    if (activeMode === 'screenshare') setActiveMode('coach');
  };

  const handleStartRecording = () => {
    try {
      const canvas = document.querySelector('.camera-area canvas') as HTMLCanvasElement;
      if (!canvas) return;
      const stream = canvas.captureStream(15);
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `lumina-${Date.now()}.webm`;
        a.click(); URL.revokeObjectURL(url);
      };
      recorder.start(500);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error('Recording error:', err);
    }
  };

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setRecordingSaved(true);
    setTimeout(() => setRecordingSaved(false), 4000);
  };

  // Estimated token cost: Gemini Live ≈ $0.004/min audio in + $0.016/min audio out
  const estimatedCost = ((audioSeconds / 60) * 0.004).toFixed(4);

  const score = feedback?.accuracyScore || 0;

  return (
    <div className="app-root" data-theme={theme}>

      {/* ── HEADER ────────────────────────────────────────────── */}
      <header className="app-header">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="font-display" style={{ fontSize: '22px', color: 'var(--text-accent)', letterSpacing: '0.1em' }}>
            LUMINA
          </span>
          <span style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
            AI Coach
          </span>
          {isCoachingActive && (
            <>
              <span style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />
              <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', color: 'var(--coral)', letterSpacing: '0.15em' }}>
                <span className="rec-dot" style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--coral)', marginRight: '5px', verticalAlign: 'middle' }} />
                {formatTime(sessionTime)}
              </span>
            </>
          )}
        </div>

        {/* Right: status chips + usage + theme */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

          {/* Server connection — "Is the backend server reachable?" */}
          <div title="Backend server connection" style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '3px 9px', borderRadius: '7px',
            background: wsConnected ? 'rgba(15,244,198,0.07)' : 'rgba(255,92,53,0.07)',
            border: `1px solid ${wsConnected ? 'rgba(15,244,198,0.2)' : 'rgba(255,92,53,0.2)'}`,
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: wsConnected ? 'var(--mint)' : 'var(--coral)', boxShadow: wsConnected ? '0 0 5px var(--mint)' : 'none' }} />
            <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: wsConnected ? 'var(--text-accent)' : 'var(--coral)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Server
            </span>
          </div>

          {/* AI / Gemini session status — "Is Gemini actively coaching?" */}
          <div title="Gemini AI coaching session status" style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '3px 9px', borderRadius: '7px',
            background: isCoachingActive ? 'rgba(15,244,198,0.07)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isCoachingActive ? 'rgba(15,244,198,0.2)' : 'var(--border-subtle)'}`,
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCoachingActive ? 'var(--mint)' : 'var(--text-muted)', boxShadow: isCoachingActive ? '0 0 5px var(--mint)' : 'none' }} className={isCoachingActive ? 'rec-dot' : ''} />
            <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: isCoachingActive ? 'var(--text-accent)' : 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Gemini
            </span>
          </div>

          {/* Score chip */}
          {score > 0 && (
            <div title="Current pronunciation accuracy score" style={{
              padding: '3px 9px', borderRadius: '7px',
              background: 'var(--mint-dim)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}>
              <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Score</span>
              <span style={{ fontSize: '12px', fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'var(--text-accent)' }}>{score}%</span>
            </div>
          )}

          {/* Usage — audio sent to Gemini */}
          {audioSeconds > 0 && (
            <div title={`~$${estimatedCost} estimated Gemini API cost`} style={{
              padding: '3px 9px', borderRadius: '7px',
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', gap: '5px', cursor: 'help',
            }}>
              <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>🎙</span>
              <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>
                {Math.floor(audioSeconds / 60)}m {audioSeconds % 60}s
              </span>
              <span style={{ fontSize: '8px', fontFamily: 'JetBrains Mono', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
                ~${estimatedCost}
              </span>
            </div>
          )}

          {/* OpenClaw status */}
          <div title={openclawAvailable ? 'OpenClaw agent online' : 'OpenClaw agent offline'} style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '3px 9px', borderRadius: '7px',
            background: openclawAvailable ? 'rgba(15,244,198,0.07)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${openclawAvailable ? 'rgba(15,244,198,0.2)' : 'var(--border-subtle)'}`,
          }}>
            <span style={{ fontSize: '10px', lineHeight: 1 }}>🦞</span>
            <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: openclawAvailable ? 'var(--text-accent)' : 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              {openclawAvailable === null ? '...' : openclawAvailable ? 'Claw' : 'Offline'}
            </span>
          </div>

          {/* Theme toggle */}
          <button className="btn-theme" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* ── MAIN 3-COLUMN ─────────────────────────────────────── */}
      <div className="app-main">

        {/* LEFT SIDEBAR */}
        <LeftSidebar
          activeMode={activeMode}
          onModeChange={(mode) => {
            if (isCoachingActive && (mode !== 'coach' && mode !== 'recording' && mode !== 'screenshare')) return;
            setActiveMode(mode);
            sendModeSwitch(mode);
          }}
          theme={theme}
          onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          isCoachingActive={isCoachingActive}
          score={score}
        />

        {/* CENTER COLUMN */}
        <div className="center-col">

          {/* Camera area */}
          <div className="camera-area">
            {isMediaPipeReady ? (
              cameraOn ? (
                <VideoCanvas
                  videoRef={videoRef}
                  faceLandmarks={faceLandmarks}
                  handLandmarks={handLandmarks}
                  isCoachingActive={isCoachingActive}
                  showTracking={showTracking}
                />
              ) : (
                <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M17 10l4-2v8l-4-2M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <line x1="1" y1="1" x2="23" y2="23" stroke="rgba(255,92,53,0.5)"/>
                  </svg>
                  <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Camera Off</span>
                </div>
              )
            ) : (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', background: 'var(--camera-bg)',
              }}>
                <div style={{
                  width: '40px', height: '40px', border: '2px solid var(--mint)', borderTopColor: 'transparent',
                  borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px',
                }} />
                <p style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.35em', textTransform: 'uppercase' }}>
                  {mediaPipeError ? 'Vision Error' : 'Initializing AR Vision'}
                </p>
                {mediaPipeError && (
                  <p style={{ fontSize: '11px', color: 'var(--coral)', marginTop: '8px', maxWidth: '300px', textAlign: 'center', padding: '0 16px' }}>
                    {mediaPipeError}
                  </p>
                )}
              </div>
            )}

            {/* Vignette */}
            <div className="vignette" />

            {/* Scan line when coaching */}
            {isCoachingActive && <div className="scan-line" />}

            {/* Corner brackets */}
            <div className="corner-tl" /><div className="corner-tr" />
            <div className="corner-bl" /><div className="corner-br" />

            {/* Camera error */}
            {cameraError && (
              <div className="cam-overlay-chip" style={{ top: '10px', left: '50%', transform: 'translateX(-50%)', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--coral)' }}>⚠</span>
                <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', color: 'var(--coral)' }}>{cameraError}</span>
              </div>
            )}

            {/* Screen share indicator */}
            {isScreenSharing && (
              <div className="cam-overlay-chip" style={{ top: '10px', left: '10px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '12px' }}>🖥️</span>
                <span style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', color: 'var(--text-accent)', letterSpacing: '0.2em' }}>SCREEN SHARE</span>
              </div>
            )}

            {/* Recording indicator */}
            {isRecording && (
              <div className="cam-overlay-chip" style={{ top: '10px', right: '10px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span className="rec-dot" style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--coral)', display: 'block' }} />
                <span style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', color: 'var(--coral)', letterSpacing: '0.2em' }}>RECORDING</span>
              </div>
            )}

            {/* Gesture hold bar */}
            {handLandmarks && gesture.gesture !== 'none' && (
              <div className="cam-overlay-chip" style={{
                bottom: '10px', left: '50%', transform: 'translateX(-50%)',
                padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{ fontSize: '14px' }}>{gesture.gesture === 'thumbs_up' ? '👍' : '👎'}</span>
                <div style={{ width: '60px', height: '3px', background: 'var(--border-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (gesture.holdDuration / 500) * 100)}%`,
                    background: gesture.holdDuration >= 500 ? 'var(--mint)' : 'var(--coral)',
                    transition: 'width 0.1s linear, background 0.2s ease',
                    borderRadius: '3px',
                  }} />
                </div>
                <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {gesture.holdDuration >= 500 ? 'Activating...' : 'Hold...'}
                </span>
              </div>
            )}

            {/* Gesture reaction overlay */}
            {gestureReaction && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 10 }}>
                <div className="gesture-ring" />
                <div className="gesture-ring-2" />
                <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <div className="gesture-emoji" style={{ fontSize: '60px' }}>
                    {gestureReaction === 'up' ? '👍' : '👎'}
                  </div>
                  <div style={{
                    padding: '6px 14px', borderRadius: '8px',
                    background: 'rgba(4,8,18,0.85)',
                    border: '1px solid var(--border)',
                    backdropFilter: 'blur(12px)',
                  }}>
                    <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', letterSpacing: '0.2em', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                      {gestureReaction === 'up' ? 'Session Started' : 'Session Ended'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Volume bars overlay (when mic active) */}
            {isMicEnabled && (
              <div className="cam-overlay-chip" style={{ bottom: '10px', left: '10px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '16px' }}>
                  {[...Array(8)].map((_, i) => {
                    const isActive = i < Math.round((volume / 100) * 8);
                    return (
                      <div key={i} style={{
                        width: '3px',
                        height: `${isActive ? Math.max(4, Math.min(16, 4 + (volume / 100) * 12 * (0.5 + Math.sin(i) * 0.5))) : 4}px`,
                        borderRadius: '2px',
                        background: isActive ? 'var(--mint)' : 'var(--border)',
                        transition: 'height 0.08s ease',
                      }} />
                    );
                  })}
                </div>
                <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>{Math.round(volume)}%</span>
              </div>
            )}
          </div>

          {/* Chat box */}
          <ChatBox
            messages={chatMessages}
            onSend={handleSendChat}
            isConnected={wsConnected}
            isCoachingActive={isCoachingActive}
          />

          {/* Controls bar */}
          <div className="controls-bar" style={{ justifyContent: 'space-between', paddingLeft: '12px', paddingRight: '12px' }}>
            {/* Left group: camera, tracking, mic, record, screen share */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>

              {/* Camera on/off */}
              <button
                className={`btn-icon ${!cameraOn ? 'danger' : ''}`}
                onClick={handleCameraToggle}
                title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
              >
                {cameraOn ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M17 10l4-2v8l-4-2M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M17 10l4-2v8l-4-2M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                )}
              </button>

              {/* AR tracking on/off */}
              <button
                className={`btn-icon ${showTracking ? 'active' : ''}`}
                onClick={() => setShowTracking(t => !t)}
                title={showTracking ? 'Hide face/hand tracking overlay' : 'Show face/hand tracking overlay'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/>
                  {!showTracking && <line x1="1" y1="1" x2="23" y2="23"/>}
                </svg>
              </button>

              <div style={{ width: '1px', height: '20px', background: 'var(--border-subtle)', margin: '0 2px' }} />

              {/* Mic */}
              <button
                className={`btn-icon ${isMicEnabled ? 'active' : ''}`}
                onClick={handleMicToggle}
                title={isMicEnabled ? 'Mute microphone' : 'Enable microphone'}
              >
                {isMicEnabled ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="9" y="2" width="6" height="11" rx="3"/>
                    <path d="M5 10a7 7 0 0 0 14 0M12 19v3M9 22h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .36-.03.72-.08 1.06M12 19v3M9 22h6"/>
                  </svg>
                )}
              </button>

              {/* Record — with label */}
              <button
                className={`btn-icon ${isRecording ? 'danger active' : ''}`}
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                title={isRecording ? 'Stop recording & save .webm file' : 'Record session (saves to your computer)'}
                style={{ gap: '3px', width: 'auto', padding: '0 8px', borderRadius: '8px', fontSize: '10px', fontFamily: 'JetBrains Mono' }}
              >
                {isRecording ? (
                  <>
                    <span className="rec-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--coral)', display: 'block' }} />
                    <span>STOP + SAVE</span>
                  </>
                ) : recordingSaved ? (
                  <>
                    <span style={{ color: 'var(--mint)', fontSize: '12px' }}>✓</span>
                    <span style={{ color: 'var(--mint)' }}>SAVED</span>
                  </>
                ) : (
                  <>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                    <span>REC</span>
                  </>
                )}
              </button>

              {/* Screen share */}
              <button
                className={`btn-icon ${isScreenSharing ? 'active' : ''}`}
                onClick={() => isScreenSharing ? stopScreenShare() : startScreenShare()}
                title={isScreenSharing ? 'Stop screen share' : 'Share your screen'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="2" y="3" width="20" height="13" rx="2"/>
                  <path d="M8 21h8M12 17v4"/>
                </svg>
              </button>

              <div style={{ width: '1px', height: '20px', background: 'var(--border-subtle)', margin: '0 2px' }} />

              {/* Ask OpenClaw */}
              <button
                className="btn-icon"
                onClick={handleAskOpenClaw}
                disabled={!openclawAvailable || openclawLoading}
                title={openclawAvailable ? 'Ask OpenClaw to analyze your session' : 'OpenClaw offline'}
                style={{
                  gap: '4px', width: 'auto', padding: '0 8px', borderRadius: '8px',
                  fontSize: '10px', fontFamily: 'JetBrains Mono',
                  opacity: openclawAvailable ? 1 : 0.35,
                }}
              >
                {openclawLoading ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="animate-spin" stroke="currentColor" strokeWidth="3">
                      <circle cx="12" cy="12" r="9" strokeOpacity="0.3"/><path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round"/>
                    </svg>
                    <span>Thinking...</span>
                  </>
                ) : (
                  <><span style={{ fontSize: '11px' }}>🦞</span><span>Ask Claw</span></>
                )}
              </button>
            </div>

            {/* Center: Start/Stop session */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!isCoachingActive ? (
                <button className="btn-primary" onClick={handleStartCoaching} disabled={isLoading || !wsConnected}>
                  {isLoading ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="animate-spin" stroke="currentColor" strokeWidth="3">
                        <circle cx="12" cy="12" r="9" strokeOpacity="0.3"/><path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round"/>
                      </svg>
                      Starting...
                    </>
                  ) : (
                    <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Start Session</>
                  )}
                </button>
              ) : (
                <button className="btn-stop" onClick={handleStopCoaching}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                  End Session
                </button>
              )}
            </div>

            {/* Right: gesture hint */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.4 }}>
              {!isCoachingActive ? (
                <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  👍 gesture to start
                </span>
              ) : (
                <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  👎 gesture to stop
                </span>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT HISTORY PANEL */}
        <HistoryPanel
          collapsed={historyCollapsed}
          onToggle={() => setHistoryCollapsed(c => !c)}
          currentFeedback={feedback}
          isLoading={isLoading}
          history={history}
        />
      </div>

      {/* Spin animation (global) */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
