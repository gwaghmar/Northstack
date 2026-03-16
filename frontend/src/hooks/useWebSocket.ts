/**
 * useWebSocket hook
 * Manages WebSocket connection to backend
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { WS_URL } from '../utils/constants';
import { CoachingResponse } from '../types';

const MAX_RECONNECT_DELAY = 8000;
const INITIAL_RECONNECT_DELAY = 1000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const unmountedRef = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<CoachingResponse | null>(null);
  const messageHandlerRef = useRef<((data: any) => void) | null>(null);
  const audioBytesHandlerRef = useRef<((pcmBytes: ArrayBuffer) => void) | null>(null);

  const uint8ToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  };

  const normalizeResponse = (data: any): CoachingResponse | null => {
    if (!data || typeof data !== 'object') return null;
    // Pass through all message types
    return {
      type: data.type,
      transcript: data.transcript || '',
      feedback: data.feedback || '',
      accuracyScore: Number(data.accuracy_score ?? data.accuracyScore ?? 0),
      corrections: Array.isArray(data.corrections) ? data.corrections : [],
      tips: Array.isArray(data.tips) ? data.tips : [],
      recordingUrl: data.recording_url || data.recordingUrl,
      text: data.text || '',
      visual: data.visual,
    };
  };

  const scheduleReconnect = useCallback(() => {
    if (unmountedRef.current) return;
    const delay = reconnectDelayRef.current;
    reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
    reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
  }, []);

  function connectWebSocket() {
    if (unmountedRef.current) return;
    try {
      const ws = new WebSocket(`${WS_URL}/ws/coach`);

      ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
        setIsConnected(true);
        setError(null);
      };

      ws.binaryType = 'arraybuffer';

      ws.onmessage = (event) => {
        // Binary message = raw PCM audio from Gemini (16-bit, 24 kHz)
        if (event.data instanceof ArrayBuffer) {
          if (audioBytesHandlerRef.current) {
            audioBytesHandlerRef.current(event.data);
          }
          return;
        }
        try {
          const data = JSON.parse(event.data);
          const normalized = normalizeResponse(data);
          if (normalized) {
            setLastResponse(normalized);
          }
          if (messageHandlerRef.current) {
            messageHandlerRef.current(data);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        scheduleReconnect();
      };

      wsRef.current = ws;
    } catch (err) {
      setError(`Failed to connect to WebSocket: ${err}`);
      console.error('WebSocket connection error:', err);
      scheduleReconnect();
    }
  }

  useEffect(() => {
    unmountedRef.current = false;
    connectWebSocket();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const sendAudioChunk = useCallback((audioData: Uint8Array) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const base64Audio = uint8ToBase64(audioData);
      
      wsRef.current.send(
        JSON.stringify({
          type: 'audio',
          audio: base64Audio,
          timestamp: Date.now(),
        })
      );
    }
  }, []);

  const endSession = useCallback((finalAudioData?: Uint8Array) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload: Record<string, unknown> = { type: 'end_session' };
      if (finalAudioData && finalAudioData.length > 0) {
        payload.final_audio_base64 = uint8ToBase64(finalAudioData);
      }
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const setMessageHandler = useCallback((handler: (data: any) => void) => {
    messageHandlerRef.current = handler;
  }, []);

  const setAudioBytesHandler = useCallback((handler: (pcmBytes: ArrayBuffer) => void) => {
    audioBytesHandlerRef.current = handler;
  }, []);

  const sendImageFrame = useCallback((base64Image: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'image',
          image: base64Image,
          timestamp: Date.now(),
        })
      );
    }
  }, []);

  const sendText = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text, timestamp: Date.now() }));
    }
  }, []);

  const sendModeSwitch = useCallback((mode: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mode_switch', mode, timestamp: Date.now() }));
    }
  }, []);

  return {
    isConnected,
    error,
    lastResponse,
    sendAudioChunk,
    sendImageFrame,
    sendText,
    sendModeSwitch,
    endSession,
    setMessageHandler,
    setAudioBytesHandler,
  };
}
