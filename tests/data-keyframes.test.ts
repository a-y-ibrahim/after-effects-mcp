import { describe, it, expect } from "vitest";
import {
  evenlySpacedPoints,
  detectInputRange,
  buildDataSeriesKeyframes,
} from "../src/lib/data-keyframes";

describe("evenlySpacedPoints", () => {
  it("spaces values by interval starting at 0 by default", () => {
    const points = evenlySpacedPoints([10, 20, 30], 0.5);
    expect(points).toEqual([
      { time: 0, value: 10 },
      { time: 0.5, value: 20 },
      { time: 1, value: 30 },
    ]);
  });

  it("honors a custom startTime offset", () => {
    const points = evenlySpacedPoints([1, 2], 1, 5);
    expect(points).toEqual([
      { time: 5, value: 1 },
      { time: 6, value: 2 },
    ]);
  });

  it("returns an empty array for an empty series", () => {
    expect(evenlySpacedPoints([], 1)).toEqual([]);
  });
});

describe("detectInputRange", () => {
  it("returns [min, max] of the series", () => {
    expect(detectInputRange([5, 1, 9, 3])).toEqual([1, 9]);
  });

  it("widens a flat series by ±1 instead of returning a zero-width range", () => {
    expect(detectInputRange([7, 7, 7])).toEqual([6, 8]);
  });

  it("returns [0, 1] for an empty series", () => {
    expect(detectInputRange([])).toEqual([0, 1]);
  });
});

describe("buildDataSeriesKeyframes", () => {
  it("maps the series min/max to outputMin/outputMax by default (auto-detected range)", () => {
    const keyframes = buildDataSeriesKeyframes(
      [
        { time: 0, value: 0 },
        { time: 1, value: 50 },
        { time: 2, value: 100 },
      ],
      { outputMin: 0, outputMax: 1 },
    );
    expect(keyframes[0].value).toBeCloseTo(0);
    expect(keyframes[1].value).toBeCloseTo(0.5);
    expect(keyframes[2].value).toBeCloseTo(1);
  });

  it("sorts out-of-order points by time before keyframing", () => {
    const keyframes = buildDataSeriesKeyframes(
      [
        { time: 2, value: 100 },
        { time: 0, value: 0 },
        { time: 1, value: 50 },
      ],
      { outputMin: 0, outputMax: 100 },
    );
    expect(keyframes.map((k) => k.time)).toEqual([0, 1, 2]);
    expect(keyframes.map((k) => k.value)).toEqual([0, 50, 100]);
  });

  it("honors an explicit inputMin/inputMax instead of auto-detecting", () => {
    const keyframes = buildDataSeriesKeyframes([{ time: 0, value: 50 }], {
      outputMin: 0,
      outputMax: 100,
      inputMin: 0,
      inputMax: 200,
    });
    expect(keyframes[0].value).toBeCloseTo(25);
  });

  it("maps every point to the output midpoint when the series is flat and no explicit input range is given", () => {
    const keyframes = buildDataSeriesKeyframes(
      [
        { time: 0, value: 42 },
        { time: 1, value: 42 },
      ],
      { outputMin: 0, outputMax: 10 },
    );
    expect(keyframes[0].value).toBeCloseTo(5);
    expect(keyframes[1].value).toBeCloseTo(5);
  });

  it("does not divide by zero when inputMin equals inputMax explicitly", () => {
    const keyframes = buildDataSeriesKeyframes([{ time: 0, value: 999 }], {
      outputMin: 0,
      outputMax: 10,
      inputMin: 5,
      inputMax: 5,
    });
    expect(Number.isFinite(keyframes[0].value)).toBe(true);
    expect(keyframes[0].value).toBeCloseTo(5);
  });

  it("clamps values outside [inputMin, inputMax] instead of extrapolating past outputMin/outputMax", () => {
    const keyframes = buildDataSeriesKeyframes([{ time: 0, value: 1000 }], {
      outputMin: 0,
      outputMax: 10,
      inputMin: 0,
      inputMax: 100,
    });
    expect(keyframes[0].value).toBe(10);
  });

  it("applies startTime as an offset on every keyframe", () => {
    const keyframes = buildDataSeriesKeyframes([{ time: 0, value: 0 }], {
      outputMin: 0,
      outputMax: 1,
      startTime: 3,
    });
    expect(keyframes[0].time).toBe(3);
  });

  it("smooths raw values before mapping when smoothingWindow > 1", () => {
    const noisy = [
      { time: 0, value: 0 },
      { time: 1, value: 100 },
      { time: 2, value: 0 },
    ];
    const unsmoothed = buildDataSeriesKeyframes(noisy, { outputMin: 0, outputMax: 1 });
    const smoothed = buildDataSeriesKeyframes(noisy, {
      outputMin: 0,
      outputMax: 1,
      smoothingWindow: 3,
    });
    expect(unsmoothed[1].value).toBeCloseTo(1);
    expect(smoothed[1].value).toBeLessThan(unsmoothed[1].value);
  });

  it("returns an empty array for an empty series", () => {
    expect(buildDataSeriesKeyframes([], { outputMin: 0, outputMax: 1 })).toEqual([]);
  });

  it("supports an inverted output range (outputMin > outputMax)", () => {
    const keyframes = buildDataSeriesKeyframes(
      [
        { time: 0, value: 0 },
        { time: 1, value: 1 },
      ],
      { outputMin: 100, outputMax: 0, inputMin: 0, inputMax: 1 },
    );
    expect(keyframes[0].value).toBe(100);
    expect(keyframes[1].value).toBe(0);
  });
});
