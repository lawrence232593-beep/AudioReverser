/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  Volume2,
  VolumeX,
  Check,
  AlertCircle,
  Loader2,
  ListRestart,
  Music,
  Trash2,
  Info,
  Clock,
  Play,
  Pause
} from 'lucide-react';
import { SavedTrack, RecordingState } from './types';
import { getAllTracks, saveTrack, deleteTrack } from './lib/db';
import { reverseAudioBlob } from './lib/audio';
import AudioVisualizer from './components/AudioVisualizer';
import TrackList from './components/TrackList';

export default function App() {
  const [tracks, setTracks] = useState<SavedTrack[]>([]);
  const [state, setState] = useState<RecordingState>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [previewTrack, setPreviewTrack] = useState<SavedTrack | null>(null);
  const [trackName, setTrackName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Custom Modal Deletion state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Audio elements references for capture & previewing
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const [previewIsPlaying, setPreviewIsPlaying] = useState<boolean>(false);
  const [previewTime, setPreviewTime] = useState<number>(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Environment checks
  const [isUnsupported, setIsUnsupported] = useState(false);

  // Initial load
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsUnsupported(true);
    }

    const loadSavedTracks = async () => {
      try {
        const saved = await getAllTracks();
        setTracks(saved);
      } catch (err) {
        console.error('Error loading tracks from IndexedDB:', err);
      }
    };

    loadSavedTracks();
  }, []);

  // Manage Preview Playback state
  useEffect(() => {
    if (state === 'success' && previewTrack) {
      const audio = new Audio();
      const blobUrl = URL.createObjectURL(previewTrack.blob);
      previewUrlRef.current = blobUrl;
      audio.src = blobUrl;

      const handleTimeUpdate = () => {
        setPreviewTime(audio.currentTime);
      };
      const handleEnded = () => {
        setPreviewIsPlaying(false);
        setPreviewTime(0);
      };

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);

      previewAudioRef.current = audio;

      return () => {
        audio.pause();
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
        }
        setPreviewIsPlaying(false);
        setPreviewTime(0);
      };
    }
  }, [state, previewTrack]);

  // Clean timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    chunksRef.current = [];
    setErrorMsg(null);
    setPreviewTrack(null);

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = audioStream;
      setStream(audioStream);

      // Detect formats suited for current device
      let options = {};
      if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        options = { mimeType: 'audio/ogg' };
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options = { mimeType: 'audio/mp4' };
      }

      const mediaRecorder = new MediaRecorder(audioStream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setState('processing');
        const recordedBlob = new Blob(chunksRef.current, {
          type: chunksRef.current[0]?.type || 'audio/webm'
        });

        try {
          const { reversedBlob, duration, peaks } = await reverseAudioBlob(recordedBlob);
          
          // Pre-generate nice format title with timestamp
          const timestampStr = new Date().toLocaleTimeString('zh-TW', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          const defaultName = `倒轉錄音 - ${timestampStr}`;

          setPreviewTrack({
            id: Math.random().toString(36).substring(2, 11),
            name: defaultName,
            duration,
            blob: reversedBlob,
            createdAt: Date.now(),
            peaks
          });
          setTrackName(defaultName);
          setState('success');
        } catch (err: any) {
          setErrorMsg(err.message || '音訊轉碼編譯失敗，請確認麥克風獲取完全且檔案無損。');
          setState('error');
        } finally {
          // Release microphone hardware promptly
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
          setStream(null);
        }
      };

      // Start capture
      mediaRecorder.start(250); // Slice buffers to disk frequently for robustness
      setState('recording');
      setRecordingSeconds(0);

      // Incremental elapsed timer
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 119) { // Auto capping protection at 2 mins
            stopRecording();
            return 120;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err: any) {
      console.error('Recording initialization failed:', err);
      setErrorMsg('無法存取麥克風。請確認已正確授予網頁框架麥克風權限（上方控制面板可能需要允許權限）。');
      setState('error');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null; // Unbind processing to skip decode
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setStream(null);
    setState('idle');
    setRecordingSeconds(0);
  };

  const handlePreviewPlayPause = () => {
    if (!previewAudioRef.current) return;

    if (previewIsPlaying) {
      previewAudioRef.current.pause();
      setPreviewIsPlaying(false);
    } else {
      previewAudioRef.current.play()
        .then(() => setPreviewIsPlaying(true))
        .catch((err) => console.error('Preview play failed:', err));
    }
  };

  const handlePreviewWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!previewAudioRef.current || !previewTrack) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, clickX / width));

    const targetTime = percentage * previewTrack.duration;
    previewAudioRef.current.currentTime = targetTime;
    setPreviewTime(targetTime);

    if (!previewIsPlaying) {
      previewAudioRef.current.play().catch(() => {});
      setPreviewIsPlaying(true);
    }
  };

  const handleSaveTrack = async () => {
    if (!previewTrack) return;

    const trimmedName = trackName.trim() || `未命名倒轉錄音 (${new Date().toLocaleDateString()})`;
    const finalTrack: SavedTrack = {
      ...previewTrack,
      name: trimmedName,
      createdAt: Date.now() // finalize creation timestamp
    };

    try {
      await saveTrack(finalTrack);
      setTracks((prev) => [finalTrack, ...prev]);
      
      // Clean temporary states
      setPreviewTrack(null);
      setState('idle');
    } catch (err) {
      console.error('Failed to append track:', err);
      setErrorMsg('無法存取本地 IndexedDB，儲存音軌失敗。');
      setState('error');
    }
  };

  const startDeleteTrackFlow = (id: string) => {
    setDeletingId(id);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;

    try {
      await deleteTrack(deletingId);
      setTracks((prev) => prev.filter((t) => t.id !== deletingId));
    } catch (err) {
      console.error('Deletion error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div id="app-viewport" className="min-h-screen bg-slate-55 flex flex-col font-sans text-slate-900 overflow-hidden">
      
      {/* Top Professional Navigation Bar */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 md:px-8 shrink-0 z-10 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-xs">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-800">EchoFlip Studio</span>
        </div>
        <div className="flex gap-4 items-center text-xs font-semibold text-slate-500">
          <span className="hidden sm:inline-block px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md uppercase tracking-wider">
            Audio Reverser Professional
          </span>
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-indigo-600 font-bold text-sm">
            AI
          </div>
        </div>
      </header>

      {/* Main Responsive Sandbox Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left Side Sidebar Library - visible on Desktop, stacks neatly on mobile */}
        <aside className="w-full md:w-80 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shrink-0 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5" />
              最近錄製與倒轉
            </h2>
            {tracks.length > 0 && (
              <span id="sidebar-counter" className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
                {tracks.length}
              </span>
            )}
          </div>
          
          {/* Scrollable track list in sidebar */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 max-h-[220px] md:max-h-none">
            {tracks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-8 text-center px-4">
                <div className="w-9 h-9 rounded-full bg-slate-50 flex items-center justify-center mb-2.5">
                  <Music className="w-4 h-4 text-slate-400" />
                </div>
                <h4 className="text-xs font-semibold text-slate-600">尚未有儲存項目</h4>
                <p className="text-[10px] text-slate-400 mt-1 max-w-[180px] leading-relaxed">
                  請點擊右方錄音，倒轉後將顯示在此處。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {tracks.map((track) => (
                  <div
                    key={track.id}
                    onClick={() => {
                      const element = document.getElementById(`track-${track.id}`);
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.classList.add('ring-4', 'ring-indigo-100');
                        setTimeout(() => {
                          element.classList.remove('ring-4', 'ring-indigo-100');
                        }, 1200);
                      }
                    }}
                    className="p-3 bg-slate-50 hover:bg-indigo-50/40 border border-slate-100 hover:border-indigo-100 rounded-xl transition-all duration-200 cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <span className="font-medium text-slate-700 group-hover:text-indigo-950 text-xs truncate max-w-[150px]">
                        {track.name}
                      </span>
                      <span className="text-[9px] bg-slate-200/70 text-slate-600 px-1.5 py-0.5 rounded font-mono font-semibold">
                        {formatTime(track.duration)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 group-hover:text-indigo-500">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(track.createdAt).toLocaleDateString('zh-TW')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-center">
            <span className="text-[10px] font-mono text-slate-400 font-semibold tracking-wide uppercase">
              Web Storage: Active
            </span>
          </div>
        </aside>

        {/* Right Main Focus Area */}
        <div className="flex-1 flex flex-col p-5 md:p-8 overflow-y-auto space-y-6">
          
          {/* Unsupported sandboxes error alert */}
          {isUnsupported && (
            <div id="unsupported-alert" className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-900 shadow-3xs animate-in slide-in-from-top-2">
              <Info className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold">預覽環境權限限制</h4>
                <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                  本系統需要麥克風硬體進行操作。如果您是在受限的安全沙盒之中，請點選頂部「在新分頁中打開（Open in a new tab）」即可完整開啟與保存對話。
                </p>
              </div>
            </div>
          )}

          {/* Sound Process Station Card */}
          <section id="recording-suite" className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col relative overflow-hidden transition-all duration-300">
            
            {/* Audio Panel Header */}
            <div className="p-5 md:p-6 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4 bg-slate-50/30">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                  Current Engine Status
                </span>
                <span className="text-base font-bold text-slate-800">
                  {state === 'idle' && '準備錄音反轉 Waveform'}
                  {state === 'recording' && '極速位元錄製中'}
                  {state === 'processing' && 'PCM 倒向編譯轉碼中'}
                  {state === 'success' && '倒轉音軌試聽準備就緒'}
                  {state === 'error' && '系統處理中斷'}
                </span>
              </div>

              {/* Status Tags */}
              <div className="flex items-center gap-2">
                {state === 'recording' ? (
                  <div className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold uppercase tracking-wider animate-pulse flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                    Capture mode
                  </div>
                ) : state === 'success' ? (
                  <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider text-[10px]">
                    Reversed Audio
                  </div>
                ) : (
                  <div className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold uppercase tracking-wider text-[10px]">
                    WAV Stream
                  </div>
                )}
                <div className="hidden sm:block px-3 py-1 bg-slate-150 border border-slate-200 text-slate-600 rounded-full text-xs font-semibold text-[10px]">
                  16-bit PCM / 44.1kHz
                </div>
              </div>
            </div>

            {/* Middle Waveform Dynamic Area */}
            <div className="p-6 md:p-8 flex-1 flex flex-col items-center justify-center min-h-[140px]">
              <AudioVisualizer stream={stream} isRecording={state === 'recording'} />
            </div>

            {/* Audio State Interactive Dynamic Controls Panel */}
            <div className="p-6 md:p-8 border-t border-slate-100 bg-slate-50/50 flex flex-col items-center justify-center">
              
              {/* IDLE state controls */}
              {state === 'idle' && (
                <div className="text-center space-y-4">
                  <div className="flex flex-col items-center">
                    <button
                      id="start-capture-btn"
                      onClick={startRecording}
                      className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-xl hover:shadow-red-200 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all outline-none focus:ring-4 focus:ring-red-100 relative group"
                    >
                      <Mic className="w-7 h-7 md:w-8 md:h-8" />
                    </button>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
                       Start Recording
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 max-w-sm font-medium">
                    請按一下大紅按鍵進行錄製波形。我們特別調校了 WebAudio 反轉編碼引擎。
                  </p>
                </div>
              )}

              {/* RECORDING state controls */}
              {state === 'recording' && (
                <div className="text-center space-y-4">
                  <div className="flex flex-col items-center">
                    <button
                      id="stop-capture-btn"
                      onClick={stopRecording}
                      className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-500 border-4 border-white shadow-2xl flex items-center justify-center text-white ring-4 ring-red-150 animate-pulse hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                    >
                      <Square className="w-5 h-5 fill-current" />
                    </button>
                    <span className="text-xs font-black text-red-500 uppercase tracking-widest mt-2 animate-pulse">
                      Stop Recording
                    </span>
                  </div>
                  <div className="text-2xl font-mono font-bold tracking-widest text-slate-800">
                    {formatTime(recordingSeconds)}
                  </div>
                  <button
                    id="discard-capture"
                    onClick={cancelRecording}
                    className="text-xs font-semibold text-slate-400 hover:text-slate-650 underline underline-offset-4 cursor-pointer focus:outline-none"
                  >
                    放棄重錄
                  </button>
                </div>
              )}

              {/* PROCESSING state controls */}
              {state === 'processing' && (
                <div className="text-center space-y-3 py-4">
                  <div className="relative inline-block">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700">正在重排 PCM 音訊位元結構...</h4>
                </div>
              )}

              {/* SUCCESS preview controls */}
              {state === 'success' && previewTrack && (
                <div className="w-full max-w-lg space-y-6">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3 text-indigo-900">
                    <Check className="w-4.5 h-4.5 text-indigo-600 shrink-0 mt-0.5" />
                    <p className="text-xs font-medium">
                      波形已完美反向下載！您可以在下方輸入客製名稱並永久儲存至本地。
                    </p>
                  </div>

                  {/* Elegant Workstation Seek Previewer Block */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs">
                    <div className="flex items-center gap-4">
                      <button
                        id="preview-play"
                        onClick={handlePreviewPlayPause}
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer ${
                          previewIsPlaying ? 'bg-slate-800' : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                      >
                        {previewIsPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-0.5" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1 font-mono">
                          <span className="font-bold">PREVIEW DOCK</span>
                          <span>{formatTime(previewTime)} / {formatTime(previewTrack.duration)}</span>
                        </div>

                        {/* Professional preview seeking line */}
                        <div
                          id="preview-waveform-click-area"
                          onClick={handlePreviewWaveformClick}
                          className="h-10 flex items-center gap-[2.5px] cursor-pointer group select-none relative"
                        >
                          {previewTrack.peaks.map((peakVal, index) => {
                            const barPct = index / previewTrack.peaks.length;
                            const activeProgressPct = previewTrack.duration > 0 ? previewTime / previewTrack.duration : 0;
                            const isPlayed = barPct <= activeProgressPct;
                            const barHeight = peakVal * 100;

                            return (
                              <div
                                key={index}
                                className="flex-1 rounded-full transition-colors duration-150"
                                style={{
                                  height: `${barHeight}%`,
                                  backgroundColor: isPlayed ? 'rgb(79, 70, 229)' : 'rgb(241, 245, 249)'
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Meta naming input */}
                    <div className="mt-4 pt-4 border-t border-slate-100 flex gap-3 items-center">
                      <input
                        id="track-name-input"
                        type="text"
                        value={trackName}
                        onChange={(e) => setTrackName(e.target.value)}
                        className="flex-1 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-1.5 px-3 text-xs focus:outline-none text-slate-800 bg-white"
                        placeholder="請鍵入錄音保存名稱..."
                        maxLength={32}
                      />
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex gap-3">
                    <button
                      id="discard-preview-btn"
                      onClick={() => {
                        setPreviewTrack(null);
                        setState('idle');
                      }}
                      className="flex-1 py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 transition-colors cursor-pointer"
                    >
                      長度捨棄而重錄
                    </button>
                    <button
                      id="save-preview-btn"
                      onClick={handleSaveTrack}
                      className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-indigo-100 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      儲存至保存庫
                    </button>
                  </div>
                </div>
              )}

              {/* ERROR state controls */}
              {state === 'error' && (
                <div className="text-center space-y-3.5 py-4">
                  <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-red-600 font-semibold bg-red-55 px-3 py-2 rounded-lg max-w-sm mx-auto">
                    {errorMsg}
                  </p>
                  <button
                    id="retry-btn"
                    onClick={() => setState('idle')}
                    className="py-1.5 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    重試錄製
                  </button>
                </div>
              )}

            </div>
          </section>

          {/* Detailed Wave list section in workspace */}
          <section id="library-suite" className="space-y-4">
            <div className="flex justify-between items-baseline px-1">
              <h3 className="text-sm font-bold text-slate-700 font-sans tracking-wide uppercase flex items-center gap-1.5">
                線上多端音軌庫
              </h3>
              <p className="text-[10px] text-slate-400 font-sans font-medium">
                IndexedDB SECURED • PERSISTED
              </p>
            </div>

            <TrackList tracks={tracks} onDeleteTrack={startDeleteTrackFlow} />
          </section>

        </div>

      </div>

      {/* Professional Footer Status Bar */}
      <footer className="h-8 bg-slate-800 text-slate-400 flex items-center justify-between px-6 text-[10px] uppercase font-bold tracking-widest shrink-0">
        <div className="flex gap-6">
          <span className="hidden sm:inline">Output Device: Default Web Audio Out</span>
          <span>Sample Rate: 44.1kHz</span>
          <span>Format: 16-bit WAV PCM</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span>Local Engine Active</span>
        </div>
      </footer>

      {/* Delete Confirmation Overlays */}
      {deletingId && (
        <div id="delete-modal-backdrop" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl border border-slate-100 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4 text-red-500">
              <AlertCircle className="w-5.5 h-5.5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">確定要刪除此音軌？</h3>
            <p className="text-[11.5px] text-slate-400 mt-2 leading-relaxed max-w-[280px]">
              這將會從您的瀏覽器沙盒資料庫中永久刪除此音軌，此操作將無法復原。
            </p>
            <div className="flex gap-3 w-full mt-6">
              <button
                id="cancel-del"
                onClick={() => setDeletingId(null)}
                className="flex-1 py-2 px-4 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-500 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                id="confirm-del"
                onClick={confirmDelete}
                className="flex-1 py-1.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

