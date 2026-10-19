import { describe, expect, it } from "vitest";
import { latLngToCell, gridDisk } from "h3-js";
import { DEFAULT_WEIGHTS, computeScores, normalizePositive, pickRecommendations } from "./score";
import type { GridCell } from "../types";

function cell(h3: string, over: Partial<GridCell> = {}): GridCell {
  return {
    h3, district: "中正區", bins: 0, nbins: 0,
    mrt: 0, bus: 0, youbike: 0, food: 0, reports: 0, fill: 0,
    mrt_n: 0, bus_n: 0, youbike_n: 0, food_n: 0, fill_n: 0,
    ...over,
  };
}

describe("normalizePositive", () => {
  it("0 維持 0，正值依名次換成百分位數（和 pandas rank(pct=True) 相同）", () => {
    expect(normalizePositive([0, 0, 0, 5, 10, 20]).map((v) => +v.toFixed(3))).toEqual([0, 0, 0, 0.333, 0.667, 1]);
  });
  it("同分取平均名次", () => {
    expect(normalizePositive([3, 3, 6])).toEqual([0.5, 0.5, 1]);
  });
  it("全部是 0", () => {
    expect(normalizePositive([0, 0])).toEqual([0, 0]);
  });
});

describe("computeScores", () => {
  const center = latLngToCell(25.0478, 121.517, 9);

  it("需求相同時，有桶的格子缺口較小", () => {
    const busy = { mrt_n: 1, bus_n: 1, youbike_n: 1, food_n: 1, fill_n: 1 };
    const [a, b] = gridDisk(center, 2).slice(-2);
    const scores = computeScores([cell(a, busy), cell(b, { ...busy, bins: 2 })], DEFAULT_WEIGHTS, [1, 1]);
    expect(scores[0].gap).toBeGreaterThan(scores[1].gap);
    expect(scores[0].rank).toBe(1);
    expect(scores[1].gap).toBeCloseTo(scores[0].gap / 3);
  });

  it("各特徵貢獻加總為 1", () => {
    const s = computeScores([cell(center, { mrt_n: 0.5, food_n: 1 })], DEFAULT_WEIGHTS, [0])[0];
    const sum = Object.values(s.contributions).reduce((x, y) => x + y, 0);
    expect(sum).toBeCloseTo(1);
    expect(s.contributions.food).toBeGreaterThan(s.contributions.mrt);
  });
});

describe("pickRecommendations", () => {
  it("權重全為 0 時沒有建議點", () => {
    const zero = { mrt: 0, bus: 0, youbike: 0, food: 0, reports: 0, fill: 0 };
    const grid = gridDisk(latLngToCell(25.0478, 121.517, 9), 2).map((h) => cell(h, { mrt_n: 1, bus_n: 1 }));
    expect(pickRecommendations(computeScores(grid, zero, grid.map(() => 1)), zero)).toEqual([]);
  });

  it("沒有任何需求的格子不會被挑", () => {
    const grid = gridDisk(latLngToCell(25.0478, 121.517, 9), 2).map((h) => cell(h));
    expect(pickRecommendations(computeScores(grid, DEFAULT_WEIGHTS, grid.map(() => 0)), DEFAULT_WEIGHTS)).toEqual([]);
  });

  it("不會挑到相鄰的格子", () => {
    const ring = gridDisk(latLngToCell(25.0478, 121.517, 9), 1);
    const full = { mrt_n: 1, bus_n: 1, youbike_n: 1, food_n: 1, fill_n: 1 };
    const grid = ring.map((h, i) => cell(h, { ...full, mrt_n: 1 - i * 0.01 }));
    const picks = pickRecommendations(computeScores(grid, DEFAULT_WEIGHTS, grid.map(() => 1)), DEFAULT_WEIGHTS);
    expect(picks).toHaveLength(1);
  });
});
