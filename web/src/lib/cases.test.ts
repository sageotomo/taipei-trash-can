import { describe, expect, it } from "vitest";
import { BIN_RADIUS_M, buildCases, casesToCsv, nearestBin, ownerOf } from "./cases";
import { fitSize } from "./photo";
import type { Report } from "../types";

const seed = (id: string, created_at: string): Report => ({ id, category: "亂丟垃圾", lat: 25.05, lng: 121.53, cell: "0_0", created_at, simulated: true });

describe("nearestBin", () => {
  const bins = [
    { id: "B1", lat: 25.05, lng: 121.53 },
    { id: "B2", lat: 25.0505, lng: 121.53 }, // 約 55 公尺
  ];
  it("找最近的桶並算距離", () => {
    expect(nearestBin(25.0504, 121.53, bins)).toEqual({ id: "B2", dist: 11 });
  });
  it(`超過 ${BIN_RADIUS_M} 公尺算附近沒桶`, () => {
    expect(nearestBin(25.06, 121.53, bins)).toBeNull();
  });
});

describe("buildCases", () => {
  it("算通報到今天的天數", () => {
    const [c] = buildCases([seed("R0001", "2026-10-01")], [], () => "中山區", "2026-10-21");
    expect(c.age).toBe(20);
    expect(c.district).toBe("中山區");
  });
  it("依類別分派承辦單位", () => {
    expect(ownerOf("亂丟垃圾", "大安區")).toBe("環保稽查大隊");
    expect(ownerOf("垃圾桶滿溢", "大安區")).toBe("大安區清潔隊");
  });
});

describe("casesToCsv", () => {
  it("說明裡的逗號會加引號，不含處理進度欄", () => {
    const local: Report = { ...seed("LX", "2026-10-21"), local: true, note: "飲料杯,很多" };
    const csv = casesToCsv(buildCases([local], [], () => "中山區", "2026-10-21"), () => "中山區・測試");
    expect(csv).toContain('"飲料杯,很多"');
    expect(csv).not.toContain("處理進度");
    expect(csv.startsWith("\uFEFF通報編號")).toBe(true);
  });
});

describe("fitSize", () => {
  it("長邊縮到 800，不放大小圖", () => {
    expect(fitSize(4000, 3000)).toEqual({ w: 800, h: 600 });
    expect(fitSize(300, 200)).toEqual({ w: 300, h: 200 });
  });
});
