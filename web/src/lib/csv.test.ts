import { describe, expect, it } from "vitest";
import { buildPoints, detectColumns, parseCsv, readCsv } from "./csv";

describe("parseCsv", () => {
  it("處理引號、引號內逗號與換行、BOM、\\r\\n", () => {
    const text = '﻿名稱,緯度,經度\r\n"公廁,A","25.04",121.5\r\n"有""引號""\n換行",25.05,121.51\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["名稱", "緯度", "經度"],
      ["公廁,A", "25.04", "121.5"],
      ['有"引號"\n換行', "25.05", "121.51"],
    ]);
  });
});

describe("detectColumns", () => {
  it("認得中英文欄名", () => {
    expect(detectColumns(["名稱", "緯度", "經度"])).toEqual({ name: 0, lat: 1, lng: 2 });
    expect(detectColumns(["Longitude", "Latitude", "Name"])).toEqual({ name: 2, lat: 1, lng: 0 });
    expect(detectColumns(["公廁名稱", "緯度(WGS84)", "經度(WGS84)"])).toEqual({ name: 0, lat: 1, lng: 2 });
  });
});

describe("buildPoints", () => {
  it("轉成點位、找出數值欄位、跳過台北以外與壞資料", () => {
    const parsed = readCsv("name,lat,lng,座位數\nA,25.0478,121.517,10\nB,24.0,120.6,5\nC,,121.5,3\nD,25.04,121.54,1,200\n");
    const r = buildPoints(parsed, parsed.columns);
    expect(r.points.map((p) => p.name)).toEqual(["A", "D"]);
    expect(r.fields).toEqual([{ key: "f3", label: "座位數", unit: "" }]);
    expect(r.points[0].values).toEqual({ f3: 10 });
    expect(r.skipped).toEqual({ invalid: 1, outside: 1 });
  });

  it("經緯度寫反時自動對調", () => {
    const parsed = readCsv("lat,lng\n121.517,25.0478\n");
    const r = buildPoints(parsed, parsed.columns);
    expect(r.swapped).toBe(true);
    expect(r.points[0].lat).toBeCloseTo(25.0478);
  });

  it("TWD97 座標給出清楚的錯誤", () => {
    const parsed = readCsv("x,y\n302000,2770000\n");
    expect(() => buildPoints(parsed, { lat: 1, lng: 0, name: -1 })).toThrow(/TWD97/);
  });
});
