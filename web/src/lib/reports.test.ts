import { describe, expect, it } from "vitest";
import { HIGH_REPORTS, OFTEN_FULL_HOURS, createReport, suggestAction } from "./reports";

describe("suggestAction", () => {
  it("通報少：維持現狀", () => {
    expect(suggestAction(HIGH_REPORTS - 1, 0, 0)).toBe("none");
  });
  it("通報多、沒有桶：增設", () => {
    expect(suggestAction(HIGH_REPORTS, 0, 0)).toBe("add");
  });
  it("通報多、有桶且常滿：加強清運", () => {
    expect(suggestAction(5, 2, OFTEN_FULL_HOURS)).toBe("collect");
  });
  it("通報多、有桶但不常滿：加強取締", () => {
    expect(suggestAction(5, 2, OFTEN_FULL_HOURS - 1)).toBe("enforce");
  });
});

describe("createReport", () => {
  it("算出格子編號、截斷過長的說明", () => {
    const r = createReport({ category: "亂丟垃圾", note: "x".repeat(300), lat: 25.0478, lng: 121.517 });
    expect(r.cell).toMatch(/^-?\d+_-?\d+$/);
    expect(r.note).toHaveLength(200);
    expect(r.local).toBe(true);
  });
});
