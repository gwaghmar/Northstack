/**
 * useAudioStream
 * Captures microphone as 16-bit PCM 16 kHz using an AudioWorklet processor.
 * Zero-copy: each chunk is transferred as an ArrayBuffer to the callback.
 *
 * Drop-in replacement for the old ScriptProcessorNode-based version.
 * The callback now receives Uint8Array (same as before for backwards compat).
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export function useAudioStream(onAudioChunk: (data: Uint8Array) => void) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [volume, setVolume]           = useState(0);

  const ctxRef      = useRef<AudioContext | null>(null);
  const workletRef  = useRef<AudioWorkletNode | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const sourceRef   = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cbRef       = useRef(onAudioChunk);
  useEffect(() => { cbRef.current = onAudioChunk; }, [onAudioChunk]);

  const stopStream = useCallback(() => {
    if (volTimerRef.current)  { clearInterval(volTimerRef.current);  volTimerRef.current  = null; }
    if (workletRef.current)   { workletRef.current.disconnect();     workletRef.current   = null; }
    if (analyserRef.current)  { analyserRef.current.disconnect();    analyserRef.current  = null; }
    if (sourceRef.current)    { sourceRef.current.disconnect();      sourceRef.current    = null; }
    if (streamRef.current)    { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (ctxRef.current)       { ctxRef.current.close();              ctxRef.current       = null; }
    setIsStreaming(false);
    setVolume(0);
  }, []);

  const startStream = useCallback(async () => {
    stopStream(); // clean up any previous session

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = ctx;

      // Load the worklet processor from /public
      await ctx.audioWorklet.addModule('/pcm-recorder-processor.js');

      const source  = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const worklet = new AudioWorkletNode(ctx, 'pcm-recorder-processor');
      workletRef.current = worklet;

      // Receive Int16 ArrayBuffer chunks from the worklet
      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        cbRef.current(new Uint8Array(e.data));
      };

      // Volume analyser
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);
      source.connect(worklet);
      worklet.connect(ctx.destination);  // required to keep worklet alive in some browsers

      // Poll volume ~15 fps
      const buf = new Uint8Array(analyser.frequencyBinCount);
      volTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        setVolume(Math.min(100, Math.sqrt(sum / buf.length) * 500));
      }, 66);

      setIsStreaming(true);
      setError(null);
    } catch (err) {
      setError(`Failed to start mic: ${err}`);
      console.error('useAudioStream error:', err);
    }
  }, [stopStream]);

  // Clean up on unmount
  useEffect(() => () => stopStream(), [stopStream]);

  return { isStreaming, error, volume, startStream, stopStream };
}
