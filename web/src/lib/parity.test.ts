// 確認 Python（pipeline/hexgrid.py）和瀏覽器（hexgrid.ts）算出的格子編號一樣。
// 清潔箱的格子編號是 pipeline 算的，通報與指標是瀏覽器算的，兩邊必須一致。

import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latLngToCell } from "./hexgrid";
import type { BinProps, FeatureCollection } from "../types";

const dir = new URL("../../public/data/", import.meta.url);
const hasData = existsSync(new URL("bins.geojson", dir));

describe.skipIf(!hasData)("Python 與 TypeScript 的格子一致", () => {
  it("同一個經緯度，兩邊算出的格子編號相同", () => {
    const bins = JSON.parse(readFileSync(new URL("bins.geojson", dir), "utf-8")) as FeatureCollection<BinProps>;
    for (const f of bins.features) {
      const [lng, lat] = f.geometry.coordinates;
      expect(latLngToCell(lat, lng)).toBe(f.properties.cell);
    }
  });
});
