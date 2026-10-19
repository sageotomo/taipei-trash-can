// 確認 Python（pipeline/common.py）和瀏覽器（score.ts）算出的建議前 30 名一樣。
// 施政進度的 30 個點是 pipeline 算的，地圖上的建議是瀏覽器算的，兩邊必須一致。

import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, computeScores, pickRecommendations } from "./score";
import type { GridCell } from "../types";

const dir = new URL("../../public/data/", import.meta.url);
const hasData = existsSync(new URL("progress.json", dir));

describe.skipIf(!hasData)("Python 與 TypeScript 的建議點一致", () => {
  it("預設權重下的前 30 名相同", () => {
    const grid = JSON.parse(readFileSync(new URL("grid.json", dir), "utf-8")) as GridCell[];
    const progress = JSON.parse(readFileSync(new URL("progress.json", dir), "utf-8")) as { h3: string }[];
    const picks = pickRecommendations(computeScores(grid, DEFAULT_WEIGHTS, grid.map((c) => c.reports)), DEFAULT_WEIGHTS);
    expect(picks.map((p) => p.h3)).toEqual(progress.map((p) => p.h3));
  });
});
