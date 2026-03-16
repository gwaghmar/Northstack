/**
 * HandGestureOverlay - legacy, kept for compatibility
 * Gesture UI is now handled inline in CoachSession
 */

'use client';

import React from 'react';
import { GestureDetection } from '../types';

interface HandGestureOverlayProps {
  gesture: GestureDetection;
  isThumbsUp: boolean;
  isThumbsDown: boolean;
}

export default function HandGestureOverlay(_props: HandGestureOverlayProps) {
  return null;
}
