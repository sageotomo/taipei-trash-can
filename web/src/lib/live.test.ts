import { describe, expect, it } from "vitest";
import { distanceM, fillStatus, liveTime, nearest } from "./live";

describe("liveTime", () => {
  it("把台北時間對應到模擬的小時索引（週一 00:00 = 0）", () => {
    // 2026-10-20 是週二；台北 23:24 = UTC 15:24
    expect(liveTime(new Date("2026-10-20T15:24:00Z"))).toEqual({ hour: 24 + 23, clock: "23:24" });
    // 2026-10-25 週日 台北 00:05 = UTC 週六 16:05
    expect(liveTime(new Date("2026-10-24T16:05:00Z")).hour).toBe(6 * 24);
  });
});

describe("nearest", () => {
  it("依距離排序並取前 k 個", () => {
    const pts = [
      { lat: 25.05, lng: 121.52 },
      { lat: 25.04, lng: 121.52 },
      { lat: 25.0401, lng: 121.52 },
    ];
    expect(nearest(pts, 25.04, 121.52, 2).map((r) => r.i)).toEqual([1, 2]);
    expect(distanceM(25.04, 121.52, 25.05, 121.52)).toBeCloseTo(1112, -1);
  });
});

describe("fillStatus", () => {
  it("分級", () => {
    expect(fillStatus(10).label).toBe("有空位");
    expect(fillStatus(60).label).toBe("半滿");
    expect(fillStatus(85).label).toBe("快滿了");
    expect(fillStatus(100).label).toBe("已滿");
  });
});
