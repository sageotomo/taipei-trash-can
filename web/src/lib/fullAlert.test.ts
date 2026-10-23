import { describe, expect, it } from "vitest";
import { findFullClusters, neighborIndex, nextAlertHour, roadName, type AlertBin } from "./fullAlert";

// 緯度 0.001 度 ≈ 111 公尺
const at = (dLat: number, district = "士林區", road = "士東路100號"): AlertBin => ({
  lat: 25.1 + dLat,
  lng: 121.53,
  district,
  road,
});

describe("findFullClusters", () => {
  const bins = [at(0), at(0.001), at(0.002), at(0.01), at(0.0005, "北投區")];
  const nb = neighborIndex(bins);

  it("300 m 內有 3 個 ≥90% 的桶才算一區，並寫出負責的清潔隊", () => {
    const out = findFullClusters(bins, [95, 90, 99, 100, 100], nb);
    expect(out).toHaveLength(1);
    expect(out[0].members).toEqual([2, 0, 1]); // 填滿度高到低
    expect(out[0].team).toBe("士林區清潔隊");
    expect(out[0].area).toBe("士東路一帶");
    expect(out[0].radiusM).toBeGreaterThan(110);
  });

  it("不同轄區的桶不湊在一起；不到門檻就不警示", () => {
    expect(findFullClusters(bins, [95, 89, 99, 100, 100], nb)).toEqual([]);
  });

  it("同一個桶只出現在一則警示裡", () => {
    const row = [at(0), at(0.001), at(0.002), at(0.003), at(0.004), at(0.005)];
    const out = findFullClusters(row, row.map(() => 100), neighborIndex(row));
    const all = out.flatMap((c) => c.members);
    expect(new Set(all).size).toBe(all.length);
  });

  it("nextAlertHour 找到下一個會警示的小時，會繞回週一", () => {
    const levels = [
      [0, 0, 95],
      [0, 0, 95],
      [0, 0, 95],
      [0, 0, 0],
      [0, 0, 0],
    ];
    expect(nextAlertHour(bins, levels, nb, 0)).toBe(2);
    expect(nextAlertHour(bins, levels, nb, 2)).toBe(2);
    expect(nextAlertHour(bins, levels.map(() => [0, 0, 0]), nb, 0)).toBeNull();
  });
});

describe("roadName", () => {
  it("從地址取出路名", () => {
    expect(roadName("士東路180號對面(大葉高島屋停車場出口正對面)")).toBe("士東路");
    expect(roadName("中山北路三段.南往北.美術公園入口")).toBe("中山北路三段");
    expect(roadName("仰德大道1段24巷號對面公車站牌")).toBe("仰德大道");
    expect(roadName(undefined)).toBe("");
  });
});
