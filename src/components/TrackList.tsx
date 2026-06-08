/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Trash2, Download, Clock, Music } from 'lucide-react';
import { SavedTrack } from '../types';

interface TrackListProps {
  tracks: SavedTrack[];
  onDeleteTrack: (id: string) => void;
}

export default function TrackList({ tracks, onDeleteTrack }: TrackListProps) {
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [currentDuration, setCurrentDuration] = useState<number>(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setCurrentDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
      }
    };
  }, []);

  const handlePlayPause = (track: SavedTrack) => {
    if (!audioRef.current) return;

    if (activeTrackId === track.id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch((err) => console.error('Play failed:', err));
        setIsPlaying(true);
      }
    } else {
      // Pause current
      audioRef.current.pause();

      // Revoke old URL if existing to free memory
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
      }

      // Set new track
      const blobUrl = URL.createObjectURL(track.blob);
      activeUrlRef.current = blobUrl;
      
      audioRef.current.src = blobUrl;
      audioRef.current.load();
      
      setActiveTrackId(track.id);
      setCurrentTime(0);
      setCurrentDuration(track.duration);

      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.error('Playback failed:', err);
          setIsPlaying(false);
        });
    }
  };

  const handleWaveformClick = (track: SavedTrack, e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    
    // Only seek if this track is the active one; otherwise load and play
    if (activeTrackId !== track.id) {
      handlePlayPause(track);
      // Wait a tiny frame for audio to start loading then we can seek if needed,
      // but standard is just starting from beginning when activating.
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, clickX / width));
    
    const targetTime = percentage * currentDuration;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);

    if (!isPlaying) {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const triggerDownload = (track: SavedTrack) => {
    const url = URL.createObjectURL(track.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${track.name.replace(/\s+/g, '_')}_reversed.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="track-list-wrapper" className="space-y-4">
      {tracks.length === 0 ? (
        <div id="empty-state" className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-2xl bg-white text-center">
          <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
            <Music className="w-5 h-5 text-slate-400" />
          </div>
          <h3 className="text-sm font-sans font-semibold text-slate-700">尚未儲存任何錄音</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs font-sans leading-relaxed">
            在上方錄製聲音，系統會自動在瀏覽器中將其倒轉。您可以接著儲存，讓它們顯示在此處。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4.5">
          {tracks.map((track) => {
            const isCurrent = activeTrackId === track.id;
            const activeProgressPct = isCurrent && currentDuration > 0 ? currentTime / currentDuration : 0;

            return (
              <div
                id={`track-${track.id}`}
                key={track.id}
                className={`bg-white border rounded-2xl p-4 md:p-5 transition-all duration-300 flex flex-col md:flex-row gap-4 items-stretch md:items-center shadow-xs hover:shadow-md ${
                  isCurrent ? 'border-violet-200 ring-2 ring-violet-500/5 bg-violet-50/10' : 'border-slate-100'
                }`}
              >
                {/* Play / Pause circular triggers */}
                <div className="flex items-center gap-3.5 flex-none">
                  <button
                    id={`play-pause-btn-${track.id}`}
                    onClick={() => handlePlayPause(track)}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-105 active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      isCurrent && isPlaying
                        ? 'bg-violet-600 hover:bg-violet-700 text-white focus:ring-violet-500'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 focus:ring-indigo-400'
                    }`}
                    aria-label={isCurrent && isPlaying ? 'Pause' : 'Play'}
                  >
                    {isCurrent && isPlaying ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current translate-x-0.5" />
                    )}
                  </button>

                  <div className="block md:hidden">
                    <h4 className="text-sm font-semibold text-slate-800 line-clamp-1">{track.name}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(track.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Core details & responsive timeline waveform */}
                <div className="flex-1 flex flex-col justify-center min-w-0">
                  <div className="hidden md:flex justify-between items-baseline mb-2 gap-3">
                    <h4 className="text-sm font-semibold text-slate-800 truncate">{track.name}</h4>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {formatDate(track.createdAt)}
                    </span>
                  </div>

                  {/* Waveform timeline canvas representation */}
                  <div className="flex items-center gap-3 w-full">
                    <span className="text-xs font-mono text-slate-400 w-10 text-right selection-none">
                      {isCurrent ? formatTime(currentTime) : '0:00'}
                    </span>

                    <div
                      id={`waveform-${track.id}`}
                      onClick={(e) => handleWaveformClick(track, e)}
                      className="flex-1 h-12 flex items-center gap-[2px] cursor-pointer group relative select-none touch-pan-x"
                    >
                      {track.peaks.map((peak, idx) => {
                        const peakPct = idx / track.peaks.length;
                        const isPlayed = peakPct <= activeProgressPct;
                        const barHeightPct = peak * 100;

                        return (
                          <div
                            key={idx}
                            className="flex-1 rounded-full transition-colors duration-150"
                            style={{
                              height: `${barHeightPct}%`,
                              backgroundColor: isPlayed
                                ? 'rgb(139, 92, 246)' // active filled purple
                                : 'rgb(226, 232, 240)', // unplayed light slate
                            }}
                          />
                        );
                      })}
                      {/* Interactive hover guidance vertical line */}
                      <div className="absolute inset-y-0 w-[1px] bg-indigo-400/40 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" />
                    </div>

                    <span className="text-xs font-mono text-slate-400 w-10 selection-none">
                      {formatTime(track.duration)}
                    </span>
                  </div>
                </div>

                {/* Actions: Download / Remove */}
                <div className="flex items-center justify-end md:justify-center gap-2 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0 shrink-0">
                  <button
                    id={`download-btn-${track.id}`}
                    onClick={() => triggerDownload(track)}
                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all cursor-pointer focus:outline-none"
                    title="下載 WAV 檔案"
                  >
                    <Download className="w-4.5 h-4.5" />
                  </button>
                  <button
                    id={`delete-btn-${track.id}`}
                    onClick={() => onDeleteTrack(track.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer focus:outline-none"
                    title="刪除此錄音"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
