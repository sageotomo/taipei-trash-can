import { afterEach, describe, expect, it, vi } from "vitest";
import { HIGH_REPORTS, OFTEN_FULL_HOURS, createReport, loadLocalReports, suggestAction } from "./reports";

describe("loadLocalReports", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("舊版存的「清潔箱滿溢」讀進來會變成「垃圾桶滿溢」", () => {
    const stored = [{ id: "L1", category: "清潔箱滿溢", lat: 25.05, lng: 121.52, cell: "0_0", created_at: "2026-10-01" }];
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(stored), setItem: () => {} });
    expect(loadLocalReports().map((r) => r.category)).toEqual(["垃圾桶滿溢"]);
  });
});

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
