import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_ALERT, demoBinIndices, withDemoFill } from "./demoAlert";
import { findFullClusters, neighborIndex } from "./fullAlert";
import type { BinProps, FeatureCollection, FillData } from "../types";

const read = <T,>(name: string): T => JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url), "utf8"));

describe("Demo 固定警示", () => {
  const bins = read<FeatureCollection<BinProps>>("bins.geojson");
  const fill = read<FillData>("fill.json");
  const demo = demoBinIndices(bins);

  it("真實資料裡找得到 3 個和平東路的桶", () => {
    expect(demo).toHaveLength(DEMO_ALERT.roads.length);
  });

  it("任何時間都滿溢，而且會被區域警示圈成同一區", () => {
    const live = withDemoFill(fill, demo);
    expect(fill.levels.B[demo[0]].some((v) => v < 100)).toBe(true); // 原資料沒被改
    const pts = bins.features.map((f) => ({
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      district: f.properties.district,
      road: f.properties.road,
    }));
    const nb = neighborIndex(pts);
    for (const hour of [0, 50, 119, 167]) {
      const clusters = findFullClusters(pts, live.levels.B.map((row) => row[hour]), nb);
      expect(clusters.some((c) => demo.every((i) => c.members.includes(i)))).toBe(true);
    }
  });
});
