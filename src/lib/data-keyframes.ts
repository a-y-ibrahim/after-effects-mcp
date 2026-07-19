// Pure, side-effect-free helpers that turn an arbitrary numeric time series
// (stock prices, sensor readings, scores, survey results - any data with a
// time and a value) into After Effects keyframe data. Deliberately reuses
// lib/audio-reactive.ts's value-mapping and smoothing math instead of
// duplicating it: mapAmplitudeToValue and smoothAmplitudes never actually
// contained anything audio-specific, only their callers (waveform samples,
// detected peaks) did. This module is the non-audio caller. See index.ts's
// animate-from-data tool for how this is wired to the bridge.

import { mapAmplitudeToValue, smoothAmplitudes } from "./audio-reactive.js";
import type { AmplitudeCurve, Keyframe } from "./audio-reactive.js";

export interface DataPoint {
  time: number;
  value: number;
}

export interface DataSeriesKeyframeOptions {
  outputMin: number;
  outputMax: number;
  curve?: AmplitudeCurve;
  /** Raw value mapped to outputMin. Auto-detected from the series when omitted. */
  inputMin?: number;
  /** Raw value mapped to outputMax. Auto-detected from the series when omitted. */
  inputMax?: number;
  /** Moving-average window in samples, applied to raw values before mapping (default: 1 = no smoothing). */
  smoothingWindow?: number;
  /** Seconds added to every keyframe's time (default: 0). */
  startTime?: number;
}

/**
 * Turn an evenly-spaced list of raw values into {time, value} points, the
 * convenience input shape for a series with no explicit per-point time (e.g.
 * "one sample every 0.5s starting at 0").
 */
export function evenlySpacedPoints(
  values: number[],
  interval: number,
  startTime: number = 0,
): DataPoint[] {
  return values.map((value, i) => ({ time: startTime + i * interval, value }));
}

/**
 * The [min, max] of a value series, for auto-detecting an input range when
 * the caller doesn't supply one explicitly. Returns [0, 1] for an empty
 * series (nothing to detect, and callers must still get a finite, non-zero
 * span back). A flat series (every value identical) widens by ±1 around that
 * value instead of returning a zero-width range, which would otherwise make
 * every normalized value divide-by-zero into the same output regardless of
 * outputMin/outputMax.
 */
export function detectInputRange(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === max ? [min - 1, max + 1] : [min, max];
}

/**
 * Build one keyframe per data point: sort by time (a caller-supplied series
 * isn't guaranteed to already be ordered), optionally smooth the raw values,
 * normalize each into 0..1 using [inputMin, inputMax] (auto-detected from the
 * post-smoothing series when not given), then reuse the same curve-shaping
 * and output-range mapping audio waveform keyframing uses. A zero-width
 * input range (inputMin === inputMax, whether given explicitly or detected
 * from a flat series) maps every point to the output range's midpoint rather
 * than dividing by zero.
 */
export function buildDataSeriesKeyframes(
  points: DataPoint[],
  options: DataSeriesKeyframeOptions,
): Keyframe[] {
  if (points.length === 0) return [];

  const sorted = points.slice().sort((a, b) => a.time - b.time);
  const rawValues = sorted.map((p) => p.value);
  const smoothed = smoothAmplitudes(rawValues, options.smoothingWindow ?? 1);

  const [autoMin, autoMax] = detectInputRange(smoothed);
  const inputMin = options.inputMin ?? autoMin;
  const inputMax = options.inputMax ?? autoMax;
  const span = inputMax - inputMin;
  const startTime = options.startTime ?? 0;

  return sorted.map((point, i) => {
    const normalized = span === 0 ? 0.5 : (smoothed[i] - inputMin) / span;
    return {
      time: point.time + startTime,
      value: mapAmplitudeToValue(normalized, options),
    };
  });
}
