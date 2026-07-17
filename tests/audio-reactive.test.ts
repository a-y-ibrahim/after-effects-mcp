import { describe, it, expect } from "vitest";
import {
  mapAmplitudeToValue,
  smoothAmplitudes,
  buildWaveformKeyframes,
  amplitudeAtTime,
  buildPeakKeyframes,
} from "../src/lib/audio-reactive";

describe("mapAmplitudeToValue", () => {
  it("maps 0 and 1 to outputMin and outputMax under the default linear curve", () => {
    expect(mapAmplitudeToValue(0, { outputMin: 10, outputMax: 20 })).toBe(10);
    expect(mapAmplitudeToValue(1, { outputMin: 10, outputMax: 20 })).toBe(20);
  });

  it("maps linearly in between", () => {
    expect(mapAmplitudeToValue(0.5, { outputMin: 0, outputMax: 100 })).toBe(50);
  });

  it("clamps out-of-range amplitude instead of extrapolating", () => {
    expect(mapAmplitudeToValue(-1, { outputMin: 0, outputMax: 100 })).toBe(0);
    expect(mapAmplitudeToValue(2, { outputMin: 0, outputMax: 100 })).toBe(100);
  });

  it("supports an inverted range (outputMin > outputMax)", () => {
    expect(mapAmplitudeToValue(0, { outputMin: 100, outputMax: 0 })).toBe(100);
    expect(mapAmplitudeToValue(1, { outputMin: 100, outputMax: 0 })).toBe(0);
  });

  it("exponential curve still hits the endpoints but suppresses the midpoint", () => {
    const mid = mapAmplitudeToValue(0.5, { outputMin: 0, outputMax: 100, curve: "exponential" });
    expect(mapAmplitudeToValue(0, { outputMin: 0, outputMax: 100, curve: "exponential" })).toBe(0);
    expect(mapAmplitudeToValue(1, { outputMin: 0, outputMax: 100, curve: "exponential" })).toBe(
      100,
    );
    expect(mid).toBeLessThan(50);
  });

  it("logarithmic curve still hits the endpoints but boosts the midpoint", () => {
    const mid = mapAmplitudeToValue(0.5, { outputMin: 0, outputMax: 100, curve: "logarithmic" });
    expect(mapAmplitudeToValue(0, { outputMin: 0, outputMax: 100, curve: "logarithmic" })).toBe(0);
    expect(mapAmplitudeToValue(1, { outputMin: 0, outputMax: 100, curve: "logarithmic" })).toBe(
      100,
    );
    expect(mid).toBeGreaterThan(50);
  });
});

describe("smoothAmplitudes", () => {
  it("is a no-op for windowSize <= 1", () => {
    const input = [0, 1, 0.5];
    expect(smoothAmplitudes(input, 1)).toEqual(input);
    expect(smoothAmplitudes(input, 0)).toEqual(input);
  });

  it("returns a copy, not the same array reference, even as a no-op", () => {
    const input = [0, 1, 0.5];
    expect(smoothAmplitudes(input, 1)).not.toBe(input);
  });

  it("averages a centered window", () => {
    // window=3 at index 2 averages indices 1..3 = (2+3+4)/3 = 3
    const input = [0, 2, 3, 4, 0];
    const out = smoothAmplitudes(input, 3);
    expect(out[2]).toBe(3);
  });

  it("shrinks the window at the edges instead of padding", () => {
    // index 0 with window=3 only has indices 0..1 available -> (10+20)/2 = 15
    const input = [10, 20, 30];
    const out = smoothAmplitudes(input, 3);
    expect(out[0]).toBe(15);
  });

  it("handles a window larger than the whole array", () => {
    const input = [1, 2, 3];
    const out = smoothAmplitudes(input, 100);
    const expected = (1 + 2 + 3) / 3;
    expect(out.every((v) => v === expected)).toBe(true);
  });
});

describe("buildWaveformKeyframes", () => {
  const waveform = [
    { time: 0, amplitude: 0 },
    { time: 0.1, amplitude: 0.5 },
    { time: 0.2, amplitude: 1 },
    { time: 0.3, amplitude: 0.5 },
  ];

  it("produces one keyframe per waveform point by default", () => {
    const kfs = buildWaveformKeyframes(waveform, { outputMin: 0, outputMax: 100 });
    expect(kfs).toHaveLength(waveform.length);
    expect(kfs[0]).toEqual({ time: 0, value: 0 });
    expect(kfs[2]).toEqual({ time: 0.2, value: 100 });
  });

  it("applies startTime as a uniform offset", () => {
    const kfs = buildWaveformKeyframes(waveform, { outputMin: 0, outputMax: 100, startTime: 5 });
    expect(kfs[0].time).toBe(5);
    expect(kfs[2].time).toBeCloseTo(5.2);
  });

  it("keeps only every Nth sample when stride > 1", () => {
    const kfs = buildWaveformKeyframes(waveform, { outputMin: 0, outputMax: 100, stride: 2 });
    expect(kfs.map((k) => k.time)).toEqual([0, 0.2]);
  });

  it("smooths amplitudes before mapping when smoothingWindow is set", () => {
    const withSmoothing = buildWaveformKeyframes(waveform, {
      outputMin: 0,
      outputMax: 100,
      smoothingWindow: 3,
    });
    const withoutSmoothing = buildWaveformKeyframes(waveform, { outputMin: 0, outputMax: 100 });
    // The peak sample (index 2, amplitude 1) should be pulled down by
    // averaging with its neighbors once smoothing is applied.
    expect(withSmoothing[2].value).toBeLessThan(withoutSmoothing[2].value);
  });
});

describe("amplitudeAtTime", () => {
  const waveform = [
    { time: 0, amplitude: 0.1 },
    { time: 1, amplitude: 0.5 },
    { time: 2, amplitude: 0.9 },
  ];

  it("returns 0 for an empty series", () => {
    expect(amplitudeAtTime([], 1)).toBe(0);
  });

  it("returns the exact match when the time lines up", () => {
    expect(amplitudeAtTime(waveform, 1)).toBe(0.5);
  });

  it("returns the nearest sample's amplitude for an in-between time", () => {
    expect(amplitudeAtTime(waveform, 1.9)).toBe(0.9);
  });
});

describe("buildPeakKeyframes", () => {
  it("returns nothing for an empty peak list", () => {
    expect(buildPeakKeyframes([], { baselineValue: 0, peakValue: 100 })).toEqual([]);
  });

  it("inserts a leading baseline keyframe before the first peak", () => {
    const kfs = buildPeakKeyframes([1], { baselineValue: 0, peakValue: 100 });
    expect(kfs[0]).toEqual({ time: 0, value: 0 });
    expect(kfs[1]).toEqual({ time: 1, value: 100 });
  });

  it("skips the leading baseline keyframe when the first peak is already at time 0", () => {
    const kfs = buildPeakKeyframes([0], { baselineValue: 0, peakValue: 100 });
    expect(kfs).toHaveLength(2); // hit + decay only, no duplicate baseline-at-0
    expect(kfs[0]).toEqual({ time: 0, value: 100 });
  });

  it("decays back to baseline after decaySeconds", () => {
    const kfs = buildPeakKeyframes([1], { baselineValue: 0, peakValue: 100, decaySeconds: 0.2 });
    expect(kfs[2]).toEqual({ time: 1.2, value: 0 });
  });

  it("applies startTime to every keyframe", () => {
    const kfs = buildPeakKeyframes([1], { baselineValue: 0, peakValue: 100, startTime: 10 });
    expect(kfs.map((k) => k.time)).toEqual([10, 11, 11.15]);
  });

  it("clamps the decay so back-to-back peaks never produce out-of-order times", () => {
    const kfs = buildPeakKeyframes([1, 1.05], {
      baselineValue: 0,
      peakValue: 100,
      decaySeconds: 0.15,
    });
    const times = kfs.map((k) => k.time);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });

  it("drops the decay step entirely when the next peak is within 1ms", () => {
    const kfs = buildPeakKeyframes([1, 1.0005], { baselineValue: 0, peakValue: 100 });
    // leading baseline, hit@1, hit@1.0005 (decay for the first peak has no
    // room and is dropped), then a final decay after the second hit.
    expect(kfs).toHaveLength(4);
    expect(kfs[0]).toEqual({ time: 0, value: 0 });
    expect(kfs[1]).toEqual({ time: 1, value: 100 });
    expect(kfs[2]).toEqual({ time: 1.0005, value: 100 });
    expect(kfs[3].value).toBe(0);
    expect(kfs[3].time).toBeCloseTo(1.1505, 6);
  });

  it("scales hit height by amplitude when peakAmplitudes is provided", () => {
    const kfs = buildPeakKeyframes(
      [1, 2],
      { baselineValue: 0, peakValue: 100, decaySeconds: 0.1 },
      [0.25, 1],
    );
    // quiet hit (0.25) is well below a full-height pulse
    expect(kfs[1].value).toBe(25);
    // loud hit (1) is a full-height pulse
    expect(kfs[3].value).toBe(100);
  });

  it("falls back to a full-height pulse for indices missing from peakAmplitudes", () => {
    const kfs = buildPeakKeyframes([1], { baselineValue: 0, peakValue: 100 }, []);
    expect(kfs[1].value).toBe(100);
  });
});
