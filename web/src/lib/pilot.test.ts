import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PILOT_DISTRICTS, areaOutlines, pilotBinIndices, pilotSummary, type PilotArea } from "./pilot";
import type { BinProps, FeatureCollection, FillData } from "../types";

const read = <T,>(name: string): T => JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url), "utf8"));

describe("感測器試辦區", () => {
  const bins = read<FeatureCollection<BinProps>>("bins.geojson");
  const fill = read<FillData>("fill.json");
  const area = read<PilotArea>("pilot_districts.geojson");
  const pilot = pilotBinIndices(bins);

  it("邊界檔有兩個試辦區，座標換成 [lat, lng]", () => {
    const outlines = areaOutlines(area);
    expect(outlines.map((o) => o.district).sort()).toEqual([...PILOT_DISTRICTS].sort());
    const [lat, lng] = outlines[0].rings[0][0];
    expect(lat).toBeGreaterThan(24.9);
    expect(lng).toBeGreaterThan(121.4);
  });

  it("只留大安區、中山區的桶", () => {
    expect(pilot.length).toBeGreaterThan(0);
    expect(pilot.every((i) => PILOT_DISTRICTS.includes(bins.features[i].properties.district as never))).toBe(true);
  });

  it("清運比較只加總試辦區的桶", () => {
    const s = pilotSummary(fill, pilot, "B");
    expect(s.trips).toBe(pilot.reduce((a, i) => a + fill.trips.B[i], 0));
    expect(s.trips).toBeLessThan(fill.summary.B.trips);
  });
});
