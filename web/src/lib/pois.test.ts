// pois.json（欄位式）轉回 GeoJSON 後要和原本的點位資料一致。

import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { poisFromColumns, type PoiColumns } from "../data";

const dir = new URL("../../public/data/", import.meta.url);
const hasData = existsSync(new URL("pois.json", dir));

describe("poisFromColumns", () => {
  it("沒有值的欄位省略，其他照原樣", () => {
    const fc = poisFromColumns({
      groups: [
        { kind: "mrt", simulated: false, lng: [121.5], lat: [25.0], props: { name: ["台北車站"], daily_flow: [100], district: ["中正區"] } },
        { kind: "shop", simulated: true, lng: [121.6, 121.7], lat: [25.1, 25.2], props: { name: ["茶", null], type: ["drink", "food"] } },
      ],
    });
    expect(fc.features).toHaveLength(3);
    expect(fc.features[0]).toEqual({
      type: "Feature",
      geometry: { type: "Point", coordinates: [121.5, 25.0] },
      properties: { kind: "mrt", name: "台北車站", daily_flow: 100, district: "中正區", simulated: false },
    });
    expect(fc.features[2].properties).toEqual({ kind: "shop", type: "food", simulated: true });
  });
});

describe.skipIf(!hasData)("真實 pois.json", () => {
  it("每一類點位都有，座標在台北附近", () => {
    const fc = poisFromColumns(JSON.parse(readFileSync(new URL("pois.json", dir), "utf-8")) as PoiColumns);
    const kinds = new Set(fc.features.map((f) => f.properties.kind));
    expect([...kinds].sort()).toEqual(["bus", "mrt", "shop", "youbike"]);
    for (const f of fc.features) {
      const [lng, lat] = f.geometry.coordinates;
      expect(lng).toBeGreaterThan(121.3);
      expect(lng).toBeLessThan(121.8);
      expect(lat).toBeGreaterThan(24.9);
      expect(lat).toBeLessThan(25.3);
    }
  });
});
