/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SavedTrack {
  id: string;
  name: string;
  duration: number; // in seconds
  blob: Blob;
  createdAt: number; // timestamp
  peaks: number[]; // pre-computed peaks for visual representation (0 to 1)
}

export type RecordingState = 'idle' | 'recording' | 'processing' | 'success' | 'error';
