/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedTrack } from '../types';

const DB_NAME = 'AudioReverserDB';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

export function initDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject(new Error('Failed to open database: ' + (event.target as IDBOpenDBRequest).error?.message));
    };
  });
}

export async function saveTrack(track: SavedTrack): Promise<void> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(track);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to save track'));
  });
}

export async function getAllTracks(): Promise<SavedTrack[]> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const tracks = request.result as SavedTrack[];
      // Sort tracks by creation date descending (newest first)
      tracks.sort((a, b) => b.createdAt - a.createdAt);
      resolve(tracks);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to fetch tracks'));
  });
}

export async function deleteTrack(id: string): Promise<void> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete track'));
  });
}
