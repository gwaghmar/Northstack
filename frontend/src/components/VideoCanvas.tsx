/**
 * VideoCanvas component
 * Full-screen camera feed with holographic AR overlays
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { FaceLandmarks, HandLandmarks } from '../types';

// MediaPipe face landmark connections for holographic mesh
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
const LIP_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];
const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33];
const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362];
const NOSE_BRIDGE = [168, 6, 197, 195, 5];
const LEFT_EYEBROW = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336];
const RIGHT_EYEBROW = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107];

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

interface VideoCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  faceLandmarks: FaceLandmarks | null;
  handLandmarks: HandLandmarks | null;
  isCoachingActive?: boolean;
  showTracking?: boolean;
}

export default function VideoCanvas({
  videoRef,
  faceLandmarks,
  handLandmarks,
  isCoachingActive = false,
  showTracking = true,
}: VideoCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId: number;

    const drawConnections = (
      ctx: CanvasRenderingContext2D,
      indices: number[],
      lm: { x: number; y: number }[],
      close = false,
    ) => {
      const pts = indices.map(i => lm[i]).filter(Boolean);
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (close) ctx.closePath();
      ctx.stroke();
    };

    const render = () => {
      if (video.readyState === 4) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!showTracking) {
          frameId = requestAnimationFrame(render);
          return;
        }

        if (faceLandmarks) {
          // Mirror landmarks to match mirrored video
          const lm = faceLandmarks.landmarks.map(l => ({
            x: (1 - l.x) * canvas.width,
            y: l.y * canvas.height,
          }));

          const activeAlpha = isCoachingActive ? 1 : 0.6;

          // Face oval — very subtle
          ctx.strokeStyle = `rgba(15, 244, 198, ${0.18 * activeAlpha})`;
          ctx.lineWidth = 0.8;
          drawConnections(ctx, FACE_OVAL, lm, true);

          // Eyebrows
          ctx.strokeStyle = `rgba(15, 244, 198, ${0.25 * activeAlpha})`;
          ctx.lineWidth = 1;
          drawConnections(ctx, LEFT_EYEBROW, lm);
          drawConnections(ctx, RIGHT_EYEBROW, lm);

          // Eyes
          ctx.strokeStyle = `rgba(15, 244, 198, ${0.35 * activeAlpha})`;
          ctx.lineWidth = 1;
          drawConnections(ctx, LEFT_EYE, lm, true);
          drawConnections(ctx, RIGHT_EYE, lm, true);

          // Nose bridge
          ctx.strokeStyle = `rgba(15, 244, 198, ${0.2 * activeAlpha})`;
          ctx.lineWidth = 1;
          drawConnections(ctx, NOSE_BRIDGE, lm);

          // Lips OUTER — the key coaching focus
          const lipAlpha = isCoachingActive ? 0.95 : 0.7;
          ctx.strokeStyle = `rgba(15, 244, 198, ${lipAlpha})`;
          ctx.lineWidth = isCoachingActive ? 2 : 1.5;
          ctx.shadowColor = '#0ff4c6';
          ctx.shadowBlur = isCoachingActive ? 6 : 3;
          drawConnections(ctx, LIP_OUTER, lm, true);
          ctx.shadowBlur = 0;

          // Lips INNER
          ctx.strokeStyle = `rgba(255, 92, 53, ${isCoachingActive ? 0.75 : 0.5})`;
          ctx.lineWidth = 1;
          drawConnections(ctx, LIP_INNER, lm, true);

          // Key articulation dots: lip corners
          const lipCorners = [61, 291];
          lipCorners.forEach(idx => {
            const pt = lm[idx];
            if (!pt) return;
            // Outer glow ring
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, isCoachingActive ? 8 : 5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(15, 244, 198, ${isCoachingActive ? 0.35 : 0.2})`;
            ctx.lineWidth = 1;
            ctx.stroke();
            // Center dot
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, isCoachingActive ? 3 : 2, 0, Math.PI * 2);
            ctx.fillStyle = isCoachingActive ? '#0ff4c6' : 'rgba(15,244,198,0.7)';
            ctx.shadowColor = '#0ff4c6';
            ctx.shadowBlur = isCoachingActive ? 8 : 4;
            ctx.fill();
            ctx.shadowBlur = 0;
          });

          // Nose tip dot
          const noseTip = lm[4];
          if (noseTip) {
            ctx.beginPath();
            ctx.arc(noseTip.x, noseTip.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(15, 244, 198, ${0.4 * activeAlpha})`;
            ctx.fill();
          }
        }

        if (handLandmarks) {
          const lm = handLandmarks.landmarks.map(l => ({
            x: (1 - l.x) * canvas.width,
            y: l.y * canvas.height,
          }));

          // Draw hand skeleton
          HAND_CONNECTIONS.forEach(([a, b]) => {
            const p1 = lm[a], p2 = lm[b];
            if (!p1 || !p2) return;
            const isThumbBone = a <= 4 || b <= 4;
            ctx.strokeStyle = isThumbBone
              ? 'rgba(255, 92, 53, 0.85)'
              : 'rgba(15, 244, 198, 0.75)';
            ctx.lineWidth = 1.5;
            ctx.shadowColor = isThumbBone ? '#ff5c35' : '#0ff4c6';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          });
          ctx.shadowBlur = 0;

          // Wrist dot
          const wrist = lm[0];
          if (wrist) {
            ctx.beginPath();
            ctx.arc(wrist.x, wrist.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(15,244,198,0.6)';
            ctx.fill();
          }

          // Fingertip dots
          [4, 8, 12, 16, 20].forEach((idx, fi) => {
            const pt = lm[idx];
            if (!pt) return;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = fi === 0 ? '#ff5c35' : '#0ff4c6';
            ctx.shadowColor = fi === 0 ? '#ff5c35' : '#0ff4c6';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;
          });
        }
      }

      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [videoRef, faceLandmarks, handLandmarks, isCoachingActive, showTracking]);

  return (
    <div className="w-full h-full relative bg-black">
      <video
        ref={videoRef}
        className="absolute w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
        autoPlay
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: 'cover' }}
      />
    </div>
  );
}
