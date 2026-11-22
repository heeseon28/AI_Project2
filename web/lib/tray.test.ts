import { describe, expect, it } from "vitest";
import { fitRegion, letterbox, MIN_SIZE, moveRegion, regionFromPoints, resizeRegion } from "./tray";

describe("region geometry", () => {
  it("builds a region from points dragged in any direction", () => {
    const r = regionFromPoints(1, 0.6, 0.7, 0.2, 0.3);
    expect(r).toMatchObject({ id: 1, x: 0.2, y: 0.3 });
    expect(r.w).toBeCloseTo(0.4);
    expect(r.h).toBeCloseTo(0.4);
  });

  it("enforces a minimum size for a click without drag", () => {
    const r = regionFromPoints(1, 0.5, 0.5, 0.5, 0.5);
    expect(r.w).toBe(MIN_SIZE);
    expect(r.h).toBe(MIN_SIZE);
  });

  it("keeps moved regions inside the photo", () => {
    const r = moveRegion({ id: 1, x: 0.7, y: 0.1, w: 0.2, h: 0.2 }, 0.5, -0.5);
    expect(r).toMatchObject({ x: 0.8, y: 0 });
  });

  it("resizes without leaving the photo", () => {
    const r = resizeRegion({ id: 1, x: 0.5, y: 0.5, w: 0.2, h: 0.2 }, 1, 1);
    expect(r).toMatchObject({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  it("clamps oversized regions", () => {
    expect(fitRegion({ id: 1, x: -0.2, y: 0.3, w: 2, h: 0.1 })).toEqual({ id: 1, x: 0, y: 0.3, w: 1, h: 0.1 });
  });
});

describe("letterbox", () => {
  it("fits a landscape crop and centres it vertically", () => {
    expect(letterbox(400, 200)).toEqual({ w: 224, h: 112, x: 0, y: 56 });
  });

  it("puts the odd leftover pixel on the right", () => {
    expect(letterbox(100, 300)).toEqual({ w: 75, h: 224, x: 74, y: 0 });
  });

  it("keeps square crops full size", () => {
    expect(letterbox(50, 50)).toEqual({ w: 224, h: 224, x: 0, y: 0 });
  });
});
