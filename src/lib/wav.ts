// Pure WAV amplitude analysis: given a decoded WAV file as a Buffer, walk the
// RIFF chunks, decode PCM samples (8/16/24/32-bit, multi-channel), downsample to
// `numPoints` amplitude points, and detect peaks. No I/O: the caller reads the
// file and passes the Buffer, which keeps all of this dense byte logic unit
// testable with hand-built buffers. Returns null for anything that is not a
// PCM WAV we can read.

export interface WavAnalysis {
  duration: number;
  sampleRate: number;
  channels: number;
  amplitudes: number[];
  peakTimes: number[];
  waveformPoints: Array<{ time: number; amplitude: number }>;
}

export function analyzeWavBuffer(buf: Buffer, numPoints: number = 200): WavAnalysis | null {
  if (buf.slice(0, 4).toString("ascii") !== "RIFF") return null;
  if (buf.slice(8, 12).toString("ascii") !== "WAVE") return null;

  let offset = 12;
  let fmtChannels = 0,
    fmtSampleRate = 0,
    fmtBitsPerSample = 0,
    fmtAudioFormat = 0;
  let dataOffset = -1,
    dataSize = 0;

  while (offset < buf.length - 8) {
    const chunkId = buf.slice(offset, offset + 4).toString("ascii");
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") {
      fmtAudioFormat = buf.readUInt16LE(offset + 8);
      fmtChannels = buf.readUInt16LE(offset + 10);
      fmtSampleRate = buf.readUInt32LE(offset + 12);
      fmtBitsPerSample = buf.readUInt16LE(offset + 22);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2 !== 0 ? 1 : 0);
  }

  if (dataOffset < 0 || fmtAudioFormat !== 1 || fmtChannels === 0) return null;

  const bytesPerSample = fmtBitsPerSample / 8;
  const totalSamples = Math.floor(dataSize / (bytesPerSample * fmtChannels));
  const duration = totalSamples / fmtSampleRate;
  const samplesPerPoint = Math.max(1, Math.floor(totalSamples / numPoints));
  const maxVal = fmtBitsPerSample === 8 ? 128 : Math.pow(2, fmtBitsPerSample - 1);

  const amplitudes: number[] = [];
  const waveformPoints: Array<{ time: number; amplitude: number }> = [];

  for (let i = 0; i < numPoints; i++) {
    let maxAmp = 0;
    const startSample = i * samplesPerPoint;
    const endSample = Math.min(startSample + samplesPerPoint, totalSamples);
    for (let s = startSample; s < endSample; s++) {
      for (let c = 0; c < fmtChannels; c++) {
        const bytePos = dataOffset + (s * fmtChannels + c) * bytesPerSample;
        if (bytePos + bytesPerSample > buf.length) continue;
        let sample = 0;
        if (fmtBitsPerSample === 16) sample = Math.abs(buf.readInt16LE(bytePos));
        else if (fmtBitsPerSample === 8) sample = Math.abs(buf.readUInt8(bytePos) - 128);
        else if (fmtBitsPerSample === 24) {
          const lo = buf.readUInt16LE(bytePos);
          const hi = buf.readInt8(bytePos + 2);
          sample = Math.abs((hi << 16) | lo);
        } else if (fmtBitsPerSample === 32) sample = Math.abs(buf.readInt32LE(bytePos));
        if (sample > maxAmp) maxAmp = sample;
      }
    }
    const norm = maxAmp / maxVal;
    const t = (i / numPoints) * duration;
    amplitudes.push(norm);
    waveformPoints.push({
      time: parseFloat(t.toFixed(4)),
      amplitude: parseFloat(norm.toFixed(4)),
    });
  }

  const maxAmplitude = Math.max(...amplitudes);
  const threshold = maxAmplitude * 0.6;
  const minGapSamples = Math.floor(numPoints * 0.03);
  const peakTimes: number[] = [];
  let lastPeakIdx = -minGapSamples;

  for (let i = 1; i < amplitudes.length - 1; i++) {
    if (
      amplitudes[i] > threshold &&
      amplitudes[i] >= amplitudes[i - 1] &&
      amplitudes[i] >= amplitudes[i + 1] &&
      i - lastPeakIdx >= minGapSamples
    ) {
      peakTimes.push(parseFloat(waveformPoints[i].time.toFixed(3)));
      lastPeakIdx = i;
    }
  }

  return {
    duration,
    sampleRate: fmtSampleRate,
    channels: fmtChannels,
    amplitudes,
    peakTimes,
    waveformPoints,
  };
}
