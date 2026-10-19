// 確認 Python（pipeline/common.py）和瀏覽器（score.ts）算出的建議前 30 名一樣。
// 施政進度的 30 個點是 pipeline 算的，地圖上的建議是瀏覽器算的，兩邊必須一致。

import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, computeScores, pickRecommendations } from "./score";
import { latLngToCell } from "./hexgrid";
import type { BinProps, FeatureCollection, GridCell } from "../types";

const dir = new URL("../../public/data/", import.meta.url);
const hasData = existsSync(new URL("progress.json", dir));

describe.skipIf(!hasData)("Python 與 TypeScript 的建議點一致", () => {
  it("預設權重下的前 30 名相同", () => {
    const grid = JSON.parse(readFileSync(new URL("grid.json", dir), "utf-8")) as GridCell[];
    const progress = JSON.parse(readFileSync(new URL("progress.json", dir), "utf-8")) as { cell: string }[];
    const picks = pickRecommendations(computeScores(grid, DEFAULT_WEIGHTS, grid.map((c) => c.reports)), DEFAULT_WEIGHTS);
    expect(picks.map((p) => p.cell)).toEqual(progress.map((p) => p.cell));
  });

  it("同一個經緯度，兩邊算出的格子編號相同", () => {
    const bins = JSON.parse(readFileSync(new URL("bins.geojson", dir), "utf-8")) as FeatureCollection<BinProps>;
    for (const f of bins.features) {
      const [lng, lat] = f.geometry.coordinates;
      expect(latLngToCell(lat, lng)).toBe(f.properties.cell);
    }
  });
});
