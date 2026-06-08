/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);
  let index = 0;
  let inputIndex = 0;

  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

/**
 * Encodes an AudioBuffer into a WAV Blob (16-bit integer PCM)
 */
export function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // 1 = raw uncompressed integer PCM
  const bitDepth = 16;

  let result: Float32Array;
  if (numOfChan === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }

  const bufferArray = new ArrayBuffer(44 + result.length * 2);
  const view = new DataView(bufferArray);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* File length */
  view.setUint32(4, 36 + result.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* Format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* Format chunk length */
  view.setUint32(16, 16, true);
  /* Sample format (raw/integer PCM is 1) */
  view.setUint16(20, format, true);
  /* Channel count */
  view.setUint16(22, numOfChan, true);
  /* Sample rate */
  view.setUint32(24, sampleRate, true);
  /* Byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
  /* Block align (channel count * bytes per sample) */
  view.setUint16(32, numOfChan * (bitDepth / 8), true);
  /* Bits per sample */
  view.setUint16(34, bitDepth, true);
  /* Data chunk identifier */
  writeString(view, 36, 'data');
  /* Data chunk length */
  view.setUint32(40, result.length * 2, true);

  // Write the PCM audio samples
  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([bufferArray], { type: 'audio/wav' });
}

/**
 * Extracts a specified number of amplitude peaks from an AudioBuffer to draw sound envelope
 */
export function generatePeaks(audioBuffer: AudioBuffer, numPeaks: number = 60): number[] {
  const channelData = audioBuffer.getChannelData(0); // Analyze the primary channel
  const step = Math.ceil(channelData.length / numPeaks);
  const peaks: number[] = [];

  for (let i = 0; i < numPeaks; i++) {
    const start = i * step;
    const end = Math.min(start + step, channelData.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const val = Math.abs(channelData[j]);
      if (val > max) {
        max = val;
      }
    }
    peaks.push(max);
  }

  // Normalize peaks to be between 0.05 and 1.0
  const maxPeak = Math.max(...peaks);
  if (maxPeak > 0) {
    return peaks.map((p) => Math.max(0.06, p / maxPeak));
  }
  return Array(numPeaks).fill(0.06);
}

/**
 * Decodes, reverses, and encodes an audio blob
 */
export async function reverseAudioBlob(blob: Blob): Promise<{ reversedBlob: Blob; duration: number; peaks: number[] }> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  const audioCtx = new AudioContextClass();

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const duration = audioBuffer.duration;

    // Create a new buffer for reversed audio
    const reversedBuffer = audioCtx.createBuffer(numberOfChannels, length, sampleRate);

    for (let channel = 0; channel < numberOfChannels; channel++) {
      const srcData = audioBuffer.getChannelData(channel);
      const destData = reversedBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        destData[i] = srcData[length - 1 - i];
      }
    }

    // Generate peak data for visualizations
    const peaks = generatePeaks(reversedBuffer, 60);

    // Encode backwards audio buffer to a standard download-ready wav file
    const reversedBlob = bufferToWav(reversedBuffer);

    return {
      reversedBlob,
      duration,
      peaks,
    };
  } catch (error: any) {
    console.error('Audio processing failed:', error);
    throw new Error('Failed to parse or reverse recording. Ensure microphone capture succeeded.');
  } finally {
    await audioCtx.close();
  }
}
