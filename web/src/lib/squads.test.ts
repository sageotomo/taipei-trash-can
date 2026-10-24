import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SQUADS, squadLabel, squadOf } from "./squads";
import { pilotBinIndices } from "./pilot";
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

  it("和平東路二段 108、110 號歸大安和平分隊", () => {
    const idx = bins.features.flatMap((f, i) =>
      ["和平東路2段108號", "和平東路2段110號"].includes(f.properties.road) ? [i] : []
    );
    expect(idx).toHaveLength(2);
    for (const i of idx) expect(squadLabel(squadAt(i)!)).toBe("大安和平分隊");
  });

  it("不在試辦區的行政區沒有分隊", () => {
    expect(squadOf("士林區", 25.09, 121.52)).toBeNull();
  });
});
