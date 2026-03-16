/**
 * useMediaPipe hook
 * Initializes and manages MediaPipe Face Landmarker and Hand Landmarker
 */

import { useEffect, useRef, useState } from 'react';
import {
  FaceLandmarker,
  HandLandmarker,
  FilesetResolver,
  Detection,
} from '@mediapipe/tasks-vision';
import { FaceLandmarks, HandLandmarks } from '../types';
import { MEDIAPIPE_CONFIG } from '../utils/constants';

export function useMediaPipe(videoRef: React.RefObject<HTMLVideoElement>) {
  const [faceLandmarks, setFaceLandmarks] = useState<FaceLandmarks | null>(null);
  const [handLandmarks, setHandLandmarks] = useState<HandLandmarks | null>(null);
  // Start as ready so the app isn't blocked if MediaPipe/camera fails
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);

  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const initializeMediaPipe = async () => {
      try {
        // Initialize Face Landmarker
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const createLandmarkers = async (delegate: 'GPU' | 'CPU') => {
          const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MEDIAPIPE_CONFIG.FACE_LANDMARKER_PATH,
              delegate: delegate,
            },
            runningMode: MEDIAPIPE_CONFIG.RUNNING_MODE,
            numFaces: MEDIAPIPE_CONFIG.MAX_FACES,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
          });

          const handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MEDIAPIPE_CONFIG.HAND_LANDMARKER_PATH,
              delegate: delegate,
            },
            runningMode: MEDIAPIPE_CONFIG.RUNNING_MODE,
            numHands: MEDIAPIPE_CONFIG.MAX_HANDS,
          });

          return { faceLandmarker, handLandmarker };
        };

        try {
          const { faceLandmarker, handLandmarker } = await createLandmarkers(MEDIAPIPE_CONFIG.DELEGATE as 'GPU' | 'CPU');
          faceLandmarkerRef.current = faceLandmarker;
          handLandmarkerRef.current = handLandmarker;
        } catch (gpuErr) {
          console.warn('Failed to initialize MediaPipe with GPU, falling back to CPU:', gpuErr);
          const { faceLandmarker, handLandmarker } = await createLandmarkers('CPU');
          faceLandmarkerRef.current = faceLandmarker;
          handLandmarkerRef.current = handLandmarker;
        }

        setIsReady(true);
      } catch (err) {
        setError(`Failed to initialize MediaPipe: ${err instanceof Error ? err.message : String(err)}`);
        console.error('MediaPipe initialization error:', err);
      }
    };

    initializeMediaPipe();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isReady || !videoRef.current) return;

    const detect = () => {
      const video = videoRef.current;
      if (!video || video.readyState !== 4) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      try {
        const timestamp = performance.now();

        // Detect face landmarks
        if (faceLandmarkerRef.current) {
          const faceResult = faceLandmarkerRef.current.detectForVideo(video, timestamp);
          if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
            const landmarks = faceResult.faceLandmarks[0];
            const blendShapes = faceResult.faceBlendshapes?.[0]?.categories || [];

            setFaceLandmarks({
              landmarks: landmarks.map((l: any) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility })),
              blendShapes: blendShapes.map((bs: any) => ({ categoryName: bs.categoryName, score: bs.score })),
            });
          }
        }

        // Detect hand landmarks
        if (handLandmarkerRef.current) {
          const handResult = handLandmarkerRef.current.detectForVideo(video, timestamp);
          if (handResult.landmarks && handResult.landmarks.length > 0) {
            const hand = handResult.landmarks[0];
            const handedness = (handResult.handedness?.[0]?.[0] as any)?.displayName || 'Unknown';
            const confidence = (handResult.handedness?.[0]?.[0] as any)?.score || 0;

            setHandLandmarks({
              landmarks: hand.map((l: any) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility })),
              handedness: handedness as 'Left' | 'Right',
              confidence,
            });
          } else {
            setHandLandmarks(null);
          }
        }
      } catch (err) {
        console.error('Detection error:', err);
      }

      animationFrameRef.current = requestAnimationFrame(detect);
    };

    animationFrameRef.current = requestAnimationFrame(detect);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isReady, videoRef]);

  return {
    faceLandmarks,
    handLandmarks,
    isReady,
    error,
  };
}
