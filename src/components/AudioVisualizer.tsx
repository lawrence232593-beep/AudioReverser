/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isRecording: boolean;
}

export default function AudioVisualizer({ stream, isRecording }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Set up the idle flat line drawing helper
  const drawIdleState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#e2e8f0'; // Cool light slate
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash configuration
  };

  useEffect(() => {
    if (!stream || !isRecording) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      drawIdleState();
      return;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      drawIdleState();
      return;
    }

    const audioCtx = new AudioContextClass();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128; // High frequency granularity is not needed for smooth voice waves
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = audioCtx;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!canvasRef.current) return;
      animationRef.current = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 1.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        // scale height based on sample amplitude
        const amplitude = dataArray[i];
        barHeight = (amplitude / 255) * height * 0.85;

        // Custom stylish linear gradient
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.15)'); // indigo-500
        gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.45)'); // violet-500
        gradient.addColorStop(1, 'rgba(20, 184, 166, 0.85)'); // teal-500

        ctx.fillStyle = gradient;

        // Center bars horizontally on canvas
        const adjustedX = x + (width - bufferLength * barWidth) / 2;

        if (barHeight > 3) {
          ctx.beginPath();
          const radius = Math.min(barWidth / 2, 4);
          const topY = height - barHeight;
          ctx.roundRect(adjustedX, topY, barWidth - 2, barHeight, [radius, radius, 0, 0]);
          ctx.fill();
        } else {
          // Soft quiescent dot indicator
          ctx.beginPath();
          ctx.arc(adjustedX + barWidth / 2, height / 2, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(139, 92, 246, 0.25)';
          ctx.fill();
        }

        x += barWidth;
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [stream, isRecording]);

  // Adjust canvas dimensions dynamically when layout shifts or screen resizes
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && canvas.parentElement) {
        // Respect retina/pixel ratios for razor-sharp visual waves
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * (window.devicePixelRatio || 1);
        canvas.height = rect.height * (window.devicePixelRatio || 1);
        drawIdleState();
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div id="visualizer-container" className="w-full h-24 bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden relative shadow-inner">
      <canvas
        id="recording-canvas"
        ref={canvasRef}
        className="w-full h-full block opacity-90 transition-opacity duration-300"
      />
      {!isRecording && (
        <span className="absolute inset-0 flex items-center justify-center text-[13px] text-slate-400 font-sans font-medium tracking-wide pointer-events-none select-none">
          Microphone Standby
        </span>
      )}
      {isRecording && (
        <span className="absolute top-3 left-3.5 flex items-center gap-1.5 text-[10px] bg-red-100 dark:bg-red-950/40 text-red-600 px-2.5 py-0.5 rounded-full font-sans font-bold tracking-wider uppercase animate-pulse">
          <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
          Live Capturing
        </span>
      )}
    </div>
  );
}
