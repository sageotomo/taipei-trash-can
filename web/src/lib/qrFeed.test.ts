import { describe, expect, it } from "vitest";
import { taipeiDate, toReports } from "./qrFeed";
import type { BinProps, FeatureCollection } from "../types";

const bins: FeatureCollection<BinProps> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [121.56649, 25.04106] },
      properties: { id: "B0365", district: "信義區", road: "x", cell: "9_-5", fill_rate: 0.1, simulated: false },
    },
  ],
};
const row = { id: "Q1023-AAAA", bin: "B0365", category: "亂丟垃圾", occurred_at: "2026-10-23T18:00", note: "", created_ms: Date.UTC(2026, 9, 23, 16, 30), has_photo: 1 };

describe("toReports", () => {
  it("用垃圾桶座標，帶照片網址", () => {
    const [r] = toReports([row], bins);
    expect(r).toMatchObject({ lat: 25.04106, lng: 121.56649, cell: "9_-5", qr: true, district: "信義區", photo: "./api/photo/Q1023-AAAA" });
    expect(r.created_at).toBe("2026-10-24"); // UTC 16:30 已是台灣隔天
  });
  it("找不到的垃圾桶略過", () => {
    expect(toReports([{ ...row, bin: "B9999" }], bins)).toEqual([]);
  });
  it("台灣日期", () => {
    expect(taipeiDate(Date.UTC(2026, 9, 23, 15, 59))).toBe("2026-10-23");
  });
});
