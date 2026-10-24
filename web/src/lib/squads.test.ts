import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SQUADS, squadLabel, squadOf } from "./squads";
import { pilotBinIndices } from "./pilot";
import { DEMO_ALERT, demoBinIndices } from "./demoAlert";
import type { BinProps, FeatureCollection } from "../types";

const bins: FeatureCollection<BinProps> = JSON.parse(
  readFileSync(new URL("../../public/data/bins.geojson", import.meta.url), "utf8")
);
const squadAt = (i: number) => {
  const f = bins.features[i];
  return squadOf(f.properties.district, f.geometry.coordinates[1], f.geometry.coordinates[0]);
};

describe("清潔分隊分配", () => {
  const pilot = pilotBinIndices(bins);

  it("試辦區每個桶都分到同一行政區的分隊", () => {
    for (const i of pilot) {
      const s = squadAt(i);
      expect(s, bins.features[i].properties.id).not.toBeNull();
      expect(s!.district).toBe(bins.features[i].properties.district);
    }
  });

  it("每個分隊都有分到桶", () => {
    const used = new Set(pilot.map((i) => squadAt(i)!.name + squadAt(i)!.district));
    expect(used.size).toBe(SQUADS.length);
  });

  it("Demo 警示的 3 桶歸和平分隊，名稱和通知一致", () => {
    const demo = demoBinIndices(bins);
    expect(demo).toHaveLength(3);
    for (const i of demo) expect(squadLabel(squadAt(i)!)).toBe(DEMO_ALERT.team);
  });

  it("不在試辦區的行政區沒有分隊", () => {
    expect(squadOf("士林區", 25.09, 121.52)).toBeNull();
  });
});
