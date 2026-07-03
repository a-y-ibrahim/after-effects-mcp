import { describe, it, expect } from "vitest";
import { analyzeWavBuffer } from "../src/lib/wav";

// Build a minimal canonical PCM WAV Buffer for testing. `samples` is per-channel
// integer PCM already in the target bit depth's signed range (or 0..255 for 8-bit).
function writeWav(opts: {
  sampleRate: number;
  bits: 8 | 16 | 24 | 32;
  channels: number;
  frames: number[][]; // frames[i] = [ch0, ch1, ...]
  audioFormat?: number; // 1 = PCM (default)
  extraChunkBefore?: { id: string; size: number }; // to test padding/chunk-walk
}): Buffer {
  const { sampleRate, bits, channels, frames, audioFormat = 1 } = opts;
  const bytesPerSample = bits / 8;
  const dataBytes = frames.length * channels * bytesPerSample;

  const data = Buffer.alloc(dataBytes);
  let p = 0;
  for (const frame of frames) {
    for (let c = 0; c < channels; c++) {
      const v = frame[c] ?? 0;
      if (bits === 8) data.writeUInt8(v & 0xff, p);
      else if (bits === 16) data.writeInt16LE(v, p);
      else if (bits === 24) {
        // Store the high byte as a raw unsigned byte; the decoder reads it with
        // readInt8 to recover the sign (matches canonical little-endian 24-bit PCM).
        data.writeUInt16LE(v & 0xffff, p);
        data.writeUInt8((v >> 16) & 0xff, p + 2);
      } else data.writeInt32LE(v, p);
      p += bytesPerSample;
    }
  }

  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(audioFormat, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * channels * bytesPerSample, 8); // byte rate
  fmt.writeUInt16LE(channels * bytesPerSample, 12); // block align
  fmt.writeUInt16LE(bits, 14);

  const chunks: Buffer[] = [];
  chunks.push(Buffer.concat([Buffer.from("fmt "), u32(16), fmt]));

  if (opts.extraChunkBefore) {
    const { id, size } = opts.extraChunkBefore;
    const body = Buffer.alloc(size + (size % 2)); // include a pad byte when odd
    chunks.push(Buffer.concat([Buffer.from(id), u32(size), body]));
  }

  chunks.push(Buffer.concat([Buffer.from("data"), u32(dataBytes), data]));

  const body = Buffer.concat(chunks);
  const riff = Buffer.concat([Buffer.from("WAVE"), body]);
  return Buffer.concat([Buffer.from("RIFF"), u32(riff.length), riff]);
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

describe("analyzeWavBuffer header validation", () => {
  it("returns null when the RIFF magic is missing", () => {
    expect(analyzeWavBuffer(Buffer.from("NOPExxxxWAVE"))).toBeNull();
  });

  it("returns null when the WAVE magic is missing", () => {
    const b = Buffer.concat([Buffer.from("RIFF"), u32(4), Buffer.from("XXXX")]);
    expect(analyzeWavBuffer(b)).toBeNull();
  });

  it("returns null when there is no data chunk", () => {
    const fmt = Buffer.alloc(16);
    fmt.writeUInt16LE(1, 0);
    fmt.writeUInt16LE(1, 2);
    fmt.writeUInt32LE(8000, 4);
    fmt.writeUInt16LE(16, 14);
    const body = Buffer.concat([Buffer.from("WAVE"), Buffer.from("fmt "), u32(16), fmt]);
    const b = Buffer.concat([Buffer.from("RIFF"), u32(body.length), body]);
    expect(analyzeWavBuffer(b)).toBeNull();
  });

  it("returns null for a non-PCM (e.g. IEEE float) format", () => {
    const b = writeWav({ sampleRate: 8000, bits: 16, channels: 1, frames: [[0]], audioFormat: 3 });
    expect(analyzeWavBuffer(b)).toBeNull();
  });
});

describe("analyzeWavBuffer decoding", () => {
  it("decodes 16-bit mono and reports sample rate, channels, and duration", () => {
    const frames = Array.from({ length: 100 }, (_, i) => [i % 2 === 0 ? 16000 : -16000]);
    const r = analyzeWavBuffer(writeWav({ sampleRate: 100, bits: 16, channels: 1, frames }), 10)!;
    expect(r).not.toBeNull();
    expect(r.sampleRate).toBe(100);
    expect(r.channels).toBe(1);
    expect(r.duration).toBeCloseTo(1.0, 5);
    // 16000 / 32768 ~= 0.488
    expect(Math.max(...r.amplitudes)).toBeGreaterThan(0.4);
  });

  it("treats 8-bit 128 as silence (unsigned midpoint)", () => {
    const frames = Array.from({ length: 20 }, () => [128]);
    const r = analyzeWavBuffer(writeWav({ sampleRate: 20, bits: 8, channels: 1, frames }), 5)!;
    expect(Math.max(...r.amplitudes)).toBe(0);
  });

  it("sign-extends 24-bit negative samples", () => {
    // -100000 fits in 24-bit signed; |(-100000)| / 2^23 is a small positive amp.
    const frames = Array.from({ length: 20 }, () => [-100000]);
    const r = analyzeWavBuffer(writeWav({ sampleRate: 20, bits: 24, channels: 1, frames }), 5)!;
    expect(Math.max(...r.amplitudes)).toBeGreaterThan(0);
    expect(Math.max(...r.amplitudes)).toBeLessThan(0.05);
  });

  it("takes the max across channels for stereo interleaved audio", () => {
    // left silent, right loud -> the point amplitude should reflect the loud channel
    const frames = Array.from({ length: 40 }, () => [0, 30000]);
    const r = analyzeWavBuffer(writeWav({ sampleRate: 40, bits: 16, channels: 2, frames }), 8)!;
    expect(r.channels).toBe(2);
    expect(Math.max(...r.amplitudes)).toBeGreaterThan(0.8);
  });

  it("walks past an odd-sized chunk (pad byte) and still finds data", () => {
    const frames = Array.from({ length: 30 }, () => [20000]);
    const r = analyzeWavBuffer(
      writeWav({
        sampleRate: 30,
        bits: 16,
        channels: 1,
        frames,
        extraChunkBefore: { id: "LIST", size: 3 }, // odd size -> 1 pad byte
      }),
      6,
    );
    expect(r).not.toBeNull();
    expect(r!.channels).toBe(1);
  });
});

describe("analyzeWavBuffer downsampling and peaks", () => {
  it("always emits exactly numPoints, even when numPoints exceeds sample count", () => {
    const frames = [[10000], [10000], [10000]]; // 3 samples
    const r = analyzeWavBuffer(writeWav({ sampleRate: 3, bits: 16, channels: 1, frames }), 50)!;
    expect(r.waveformPoints).toHaveLength(50);
    expect(r.amplitudes).toHaveLength(50);
  });

  it("detects impulse peaks above the threshold", () => {
    // mostly silent with three loud spikes spaced out
    const frames: number[][] = [];
    for (let i = 0; i < 300; i++) {
      const loud = i === 50 || i === 150 || i === 250;
      frames.push([loud ? 32000 : 0]);
    }
    const r = analyzeWavBuffer(writeWav({ sampleRate: 300, bits: 16, channels: 1, frames }), 100)!;
    expect(r.peakTimes.length).toBeGreaterThanOrEqual(1);
    expect(r.peakTimes.length).toBeLessThanOrEqual(3);
  });
});
