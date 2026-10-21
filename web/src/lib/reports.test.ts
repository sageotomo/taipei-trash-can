import { afterEach, describe, expect, it, vi } from "vitest";
import { HIGH_REPORTS, OCCURRED_MAX_DAYS, OFTEN_FULL_HOURS, createReport, loadLocalReports, localDateTime, occurredError, shortDateTime, suggestAction } from "./reports";

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
    const r = createReport({ category: "亂丟垃圾", occurredAt: "2026-10-21T08:30", note: "x".repeat(300), lat: 25.0478, lng: 121.517 });
    expect(r.cell).toMatch(/^-?\d+_-?\d+$/);
    expect(r.note).toHaveLength(200);
    expect(r.local).toBe(true);
    expect(r.occurred_at).toBe("2026-10-21T08:30");
  });
});

describe("occurredError", () => {
  const now = new Date(2026, 9, 21, 13, 45);
  it("沒填要提醒", () => {
    expect(occurredError("", now)).toMatch("請填");
  });
  it("剛剛和幾天前都可以", () => {
    expect(occurredError(localDateTime(now), now)).toBeNull();
    expect(occurredError("2026-10-18T22:10", now)).toBeNull();
  });
  it("不能填未來", () => {
    expect(occurredError("2026-10-21T15:00", now)).toMatch("晚於現在");
  });
  it(`超過 ${OCCURRED_MAX_DAYS} 天太久`, () => {
    expect(occurredError("2026-09-01T10:00", now)).toMatch("天內");
  });
  it("格式不對", () => {
    expect(occurredError("2026/10/21 10:00", now)).toMatch("格式");
  });
});

describe("shortDateTime", () => {
  it("只留月日時分", () => {
    expect(shortDateTime("2026-10-21T08:05")).toBe("10/21 08:05");
  });
});
