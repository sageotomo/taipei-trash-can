import { describe, expect, it } from "vitest";
import { pointLabel } from "./pointLabel";
import type { DataLayer } from "./indicators";

const residential: DataLayer = {
  id: "residential", label: "住宅區", unit: "處", icon: { glyph: "pin", color: "#000" }, source: "residential",
  fields: [{ key: "homes", label: "住宅值", unit: "" }], points: [],
};

describe("住宅區的說明框", () => {
  it("只列住家門牌，住宅值只說明關係、不顯示數字", () => {
    const p = { lat: 25, lng: 121.5, cell: "x", values: { homes: 456, door: 800, biz: 0.43 } };
    expect(pointLabel(residential, p, false)).toBe(
      "住宅區<br>住家門牌 800 戶<br>住宅值：隨住家門牌數增加，隨商圈程度降低",
    );
  });
  it("沒有算式資料（模擬點）時照舊顯示", () => {
    const p = { lat: 25, lng: 121.5, cell: "x", values: { homes: 1 } };
    expect(pointLabel(residential, p, true)).toBe("住宅區<br>住宅值 1（模擬）");
  });
});
