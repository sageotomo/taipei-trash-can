import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISPATCH, binSquads, dampForDemo, dispatchMessage, roadName, squadDispatch } from "./dispatch";
import { pilotBinIndices } from "./pilot";
import type { BinProps, FeatureCollection, FillData } from "../types";

const read = <T,>(name: string): T => JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url), "utf8"));

describe("Demo 調整後的需出動分隊", () => {
  const bins = read<FeatureCollection<BinProps>>("bins.geojson");
  const fill = read<FillData>("fill.json");
  const pilot = pilotBinIndices(bins);
  const squads = binSquads(bins);
  const live = dampForDemo(fill, bins);
  const fullCount = (f: FillData, h: number) => pilot.filter((i) => f.levels.B[i][h] >= DISPATCH.LEVEL).length;

  it("一週每個小時都只有 1～3 個分隊需要出動", () => {
    for (let h = 0; h < fill.hours; h++) {
      const list = squadDispatch(bins, squads, pilot, (i) => live.levels.B[i][h]);
      expect(list.length, `hour ${h}`).toBeGreaterThanOrEqual(1);
      expect(list.length, `hour ${h}`).toBeLessThanOrEqual(DISPATCH.MAX_SQUADS);
    }
  });

  it("需清運的桶大約剩一半", () => {
    let before = 0;
    let after = 0;
    for (let h = 0; h < fill.hours; h++) {
      before += fullCount(fill, h);
      after += fullCount(live, h);
      if (fullCount(fill, h) >= 2) expect(fullCount(live, h)).toBeLessThanOrEqual(Math.ceil(fullCount(fill, h) / 2) + 1);
    }
    expect(after).toBeLessThan(before * 0.6);
  });

  it("不改原資料，也不動 A 固定排程", () => {
    const again = read<FillData>("fill.json");
    expect(fill.levels.B).toEqual(again.levels.B);
    expect(live.levels.A).toBe(fill.levels.A);
  });

  it("通知把所有分隊寫在同一句", () => {
    const list = squadDispatch(bins, squads, pilot, (i) => live.levels.B[i][8 + 5 * 24]);
    const msg = dispatchMessage(list);
    for (const d of list) expect(msg).toContain(`${d.squad}轄內有 ${d.members.length} 處`);
    expect(msg).toMatch(/建議指派清運作業$/);
  });
});

describe("roadName", () => {
  it("從地址取出路名", () => {
    expect(roadName("士東路180號對面(大葉高島屋停車場出口正對面)")).toBe("士東路");
    expect(roadName("中山北路三段.南往北.美術公園入口")).toBe("中山北路三段");
    expect(roadName("和平東路2段108號")).toBe("和平東路2段");
    expect(roadName("仰德大道1段24巷號對面公車站牌")).toBe("仰德大道1段");
    expect(roadName(undefined)).toBe("");
  });
});
