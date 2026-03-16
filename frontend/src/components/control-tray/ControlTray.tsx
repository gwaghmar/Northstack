/**
 * ControlTray — mic is the primary connect/start button.
 * Clicking mic when disconnected: connects. When connected: mutes/unmutes.
 * Stop button ends the session. No separate play button or settings gear.
 */
import cn from "classnames";
import { memo, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { UseMediaStreamResult } from "../../hooks/use-media-stream-mux";
import { useScreenCapture } from "../../hooks/use-screen-capture";
import { useWebcam } from "../../hooks/use-webcam";
import { AudioRecorder } from "../../lib/audio-recorder";

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
  enableEditingSettings?: boolean;
};

type MediaStreamButtonProps = {
  isStreaming: boolean;
  onIcon: string;
  offIcon: string;
  start: () => Promise<any>;
  stop: () => any;
};

const MediaStreamButton = memo(
  ({ isStreaming, onIcon, offIcon, start, stop }: MediaStreamButtonProps) =>
    isStreaming ? (
      <button className="action-button" onClick={stop} title="Stop sharing">
        <span className="material-symbols-outlined">{onIcon}</span>
      </button>
    ) : (
      <button className="action-button" onClick={start} title="Share screen/webcam">
        <span className="material-symbols-outlined">{offIcon}</span>
      </button>
    )
);
MediaStreamButton.displayName = 'MediaStreamButton';

function ControlTray({
  videoRef,
  children,
  onVideoStreamChange = () => {},
  supportsVideo,
}: ControlTrayProps) {
  const videoStreams = [useWebcam(), useScreenCapture()];
  const [activeVideoStream, setActiveVideoStream] = useState<MediaStream | null>(null);
  const [webcam, screenCapture] = videoStreams;
  const [inVolume, setInVolume] = useState(0);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);

  const { client, connected, connect, disconnect, volume } = useLiveAPIContext();

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--volume",
      `${Math.max(5, Math.min(inVolume * 200, 8))}px`
    );
  }, [inVolume]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([{ mimeType: "audio/pcm;rate=16000", data: base64 }]);
    };
    if (connected && !muted && audioRecorder) {
      audioRecorder.on("data", onData).on("volume", setInVolume).start();
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off("data", onData).off("volume", setInVolume);
    };
  }, [connected, client, muted, audioRecorder]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = activeVideoStream;
    }
    let timeoutId = -1;
    function sendVideoFrame() {
      const video = videoRef.current;
      const canvas = renderCanvasRef.current;
      if (!video || !canvas) return;
      const ctx = canvas.getContext("2d")!;
      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;
      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 1.0);
        const data = base64.slice(base64.indexOf(",") + 1);
        client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      }
      if (connected) timeoutId = window.setTimeout(sendVideoFrame, 1000 / 0.5);
    }
    if (connected && activeVideoStream !== null) {
      requestAnimationFrame(sendVideoFrame);
    }
    return () => { clearTimeout(timeoutId); };
  }, [connected, activeVideoStream, client, videoRef]);

  const changeStreams = (next?: UseMediaStreamResult) => async () => {
    setMediaError(null);
    if (next) {
      try {
        const mediaStream = await next.start();
        setActiveVideoStream(mediaStream);
        onVideoStreamChange(mediaStream);
      } catch (err: any) {
        const msg = err?.name === 'NotAllowedError'
          ? 'Camera/screen permission denied'
          : err?.name === 'NotFoundError'
          ? 'No camera found'
          : 'Could not start camera';
        setMediaError(msg);
        setTimeout(() => setMediaError(null), 3000);
        return;
      }
    } else {
      setActiveVideoStream(null);
      onVideoStreamChange(null);
    }
    videoStreams.filter((msr) => msr !== next).forEach((msr) => msr.stop());
  };

  // Mic click: connect if not connected, else toggle mute
  const handleMicClick = async () => {
    if (!connected) {
      await connect();
    } else {
      setMuted((m) => !m);
    }
  };

  return (
    <section className="control-tray">
      <canvas style={{ display: "none" }} ref={renderCanvasRef} />
      {mediaError && (
        <div className="media-error-toast">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
          {mediaError}
        </div>
      )}
      <nav className="actions-nav">
        {/* Primary Connect Button */}
        {!connected && (
          <button
            className="action-button action-button--connect"
            onClick={connect}
            title="Start session"
          >
            <span className="material-symbols-outlined filled">play_arrow</span>
            <span className="button-text">Start Coaching</span>
          </button>
        )}

        {/* Mic — only shown when connected, used for muting */}
        {connected && (
          <button
            className={cn("action-button mic-button", { "mic-button--muted": muted })}
            onClick={() => setMuted((m) => !m)}
            title={muted ? "Unmute" : "Mute"}
          >
            <span className="material-symbols-outlined filled">
              {muted ? "mic_off" : "mic"}
            </span>
          </button>
        )}

        {/* Stop — only shown when connected */}
        {connected && (
          <button
            className="action-button action-button--stop"
            onClick={disconnect}
            title="End session"
          >
            <span className="material-symbols-outlined filled">stop</span>
          </button>
        )}

        {supportsVideo && (
          <>
            <MediaStreamButton
              isStreaming={screenCapture.isStreaming}
              start={changeStreams(screenCapture)}
              stop={changeStreams()}
              onIcon="cancel_presentation"
              offIcon="present_to_all"
            />
            <MediaStreamButton
              isStreaming={webcam.isStreaming}
              start={changeStreams(webcam)}
              stop={changeStreams()}
              onIcon="videocam_off"
              offIcon="videocam"
            />
          </>
        )}
        {children}
      </nav>
    </section>
  );
}

export default memo(ControlTray);
