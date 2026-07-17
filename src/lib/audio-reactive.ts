// Pure, side-effect-free helpers that turn analyzed audio (amplitude samples
// or detected transient/peak times, as produced by lib/wav.ts) into After
// Effects keyframe data: {time, value} pairs ready to hand to the bridge. No
// AE/bridge/file I/O happens here - see index.ts's animate-to-audio tool for
// how this is wired to analyze-audio-waveform's output and sent over the
// bridge as one batched command.

export type AmplitudeCurve = "linear" | "exponential" | "logarithmic";

export interface Keyframe {
  time: number;
  value: number;
}

export interface AmplitudeMapOptions {
  outputMin: number;
  outputMax: number;
  curve?: AmplitudeCurve;
}

/**
 * Reshape a 0..1 amplitude before it's mapped to an output range.
 * - "linear": unchanged.
 * - "exponential" (x^2): suppresses quiet passages, emphasizes loud peaks -
 *   reads as punchier/more percussive.
 * - "logarithmic" (sqrt(x)): boosts quiet-passage detail - reads as more
 *   continuously responsive, closer to how loudness is perceived.
 * Both non-linear shapes still pass through (0,0) and (1,1) exactly, so they
 * never change the mapped output's min/max, only what happens between them.
 */
function shapeCurve(x: number, curve: AmplitudeCurve): number {
  switch (curve) {
    case "exponential":
      return x * x;
    case "logarithmic":
      return Math.sqrt(x);
    case "linear":
    default:
      return x;
  }
}

/**
 * Map a single amplitude (expected 0..1, but clamped defensively so an
 * out-of-range input can never produce an out-of-range output) to
 * [outputMin, outputMax], after optionally reshaping its response curve.
 */
export function mapAmplitudeToValue(amplitude: number, options: AmplitudeMapOptions): number {
  const clamped = Math.min(1, Math.max(0, amplitude));
  const shaped = shapeCurve(clamped, options.curve ?? "linear");
  return options.outputMin + shaped * (options.outputMax - options.outputMin);
}

/**
 * Centered moving-average smoothing over an amplitude series, so raw
 * per-sample jitter doesn't become jittery frame-to-frame keyframes.
 * `windowSize` <= 1 is a no-op (returns a shallow copy, unchanged). Edge
 * samples average over whatever window fits (no padding/wraparound).
 */
export function smoothAmplitudes(amplitudes: number[], windowSize: number): number[] {
  const window = Math.max(1, Math.floor(windowSize));
  if (window <= 1) return amplitudes.slice();

  const half = Math.floor(window / 2);
  const out: number[] = new Array(amplitudes.length);
  for (let i = 0; i < amplitudes.length; i++) {
    let sum = 0;
    let count = 0;
    const from = Math.max(0, i - half);
    const to = Math.min(amplitudes.length - 1, i + half);
    for (let j = from; j <= to; j++) {
      sum += amplitudes[j];
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

export interface WaveformKeyframeOptions extends AmplitudeMapOptions {
  /** Moving-average window in samples (default: 1 = no smoothing). */
  smoothingWindow?: number;
  /** Keep only every Nth (post-smoothing) sample, to cap keyframe density (default: 1 = keep all). */
  stride?: number;
  /** Seconds added to every keyframe's time (default: 0). */
  startTime?: number;
}

/**
 * Build one keyframe per (post-smoothing, post-stride) waveform sample -
 * the "VU meter" style of audio reactivity, where a property continuously
 * rides the amplitude envelope.
 */
export function buildWaveformKeyframes(
  waveformPoints: Array<{ time: number; amplitude: number }>,
  options: WaveformKeyframeOptions,
): Keyframe[] {
  const amplitudes = waveformPoints.map((p) => p.amplitude);
  const smoothed = smoothAmplitudes(amplitudes, options.smoothingWindow ?? 1);
  const stride = Math.max(1, Math.floor(options.stride ?? 1));
  const startTime = options.startTime ?? 0;

  const keyframes: Keyframe[] = [];
  for (let i = 0; i < waveformPoints.length; i += stride) {
    keyframes.push({
      time: waveformPoints[i].time + startTime,
      value: mapAmplitudeToValue(smoothed[i], options),
    });
  }
  return keyframes;
}

/**
 * Find the amplitude of the waveform sample nearest to `targetTime`. Used to
 * make peak pulses velocity-sensitive (a louder transient pops harder).
 * Returns 0 for an empty series.
 */
export function amplitudeAtTime(
  waveformPoints: Array<{ time: number; amplitude: number }>,
  targetTime: number,
): number {
  if (waveformPoints.length === 0) return 0;
  let closest = waveformPoints[0];
  let closestDistance = Math.abs(closest.time - targetTime);
  for (const point of waveformPoints) {
    const distance = Math.abs(point.time - targetTime);
    if (distance < closestDistance) {
      closest = point;
      closestDistance = distance;
    }
  }
  return closest.amplitude;
}

export interface PeakKeyframeOptions {
  baselineValue: number;
  peakValue: number;
  /** Seconds to fall back to baseline after each hit (default: 0.15). */
  decaySeconds?: number;
  /** Seconds added to every keyframe's time (default: 0). */
  startTime?: number;
  /** Curve used to scale a hit's height by its amplitude when peakAmplitudes is given (default: "linear"). */
  curve?: AmplitudeCurve;
}

/**
 * Build a baseline -> hit -> decay keyframe run at each detected transient
 * time - the "beat pulse" style of audio reactivity (a scale/opacity pop on
 * every kick/snare/onset). A leading baseline keyframe is inserted before the
 * first peak so playback starts at rest instead of mid-pulse.
 *
 * When `peakAmplitudes` is supplied (same length as `peakTimes`, e.g. via
 * `amplitudeAtTime`), each hit's height is scaled between baseline and peak
 * by its own amplitude instead of always jumping straight to `peakValue` -
 * quieter transients pop less. Without it, every hit is a full-height pulse.
 *
 * Back-to-back peaks closer together than `decaySeconds` have their decay
 * clamped to just before the next hit, so a fast run of transients never
 * produces out-of-order keyframe times; if two hits are within 1ms of each
 * other the decay step for the first is dropped entirely rather than
 * emitting a zero/negative-length segment.
 */
export function buildPeakKeyframes(
  peakTimes: number[],
  options: PeakKeyframeOptions,
  peakAmplitudes?: number[],
): Keyframe[] {
  const decay = options.decaySeconds ?? 0.15;
  const startTime = options.startTime ?? 0;
  const keyframes: Keyframe[] = [];

  if (peakTimes.length > 0 && peakTimes[0] > 0) {
    keyframes.push({ time: startTime, value: options.baselineValue });
  }

  for (let i = 0; i < peakTimes.length; i++) {
    const hitTime = peakTimes[i] + startTime;
    const hitValue =
      peakAmplitudes && peakAmplitudes[i] !== undefined
        ? mapAmplitudeToValue(peakAmplitudes[i], {
            outputMin: options.baselineValue,
            outputMax: options.peakValue,
            curve: options.curve,
          })
        : options.peakValue;
    keyframes.push({ time: hitTime, value: hitValue });

    const nextHitTime = i + 1 < peakTimes.length ? peakTimes[i + 1] + startTime : Infinity;
    const decayTime = Math.min(hitTime + decay, nextHitTime - 0.001);
    if (decayTime > hitTime) {
      keyframes.push({ time: decayTime, value: options.baselineValue });
    }
  }

  return keyframes;
}
