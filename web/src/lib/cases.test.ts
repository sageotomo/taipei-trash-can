import { describe, expect, it } from "vitest";
import {
  BIN_RADIUS_M,
  SLA_DAYS,
  buildCases,
  casesToCsv,
  maskContact,
  nearestBin,
  ownerOf,
  simulatedStatus,
  validContact,
} from "./cases";
import { fitSize } from "./photo";
import type { Report } from "../types";

const seed = (id: string, created_at: string): Report => ({ id, category: "亂丟垃圾", lat: 25.05, lng: 121.53, cell: "0_0", created_at, simulated: true });

describe("validContact", () => {
  it.each(["", "0912345678", "0912-345-678", "+886912345678", "02-2720-8889", "a@b.tw", " name@example.com "])("接受 %s", (c) => {
    expect(validContact(c)).toBe(true);
  });
  it.each(["091234", "abc", "a@b", "0912345678x", "1234567890"])("拒絕 %s", (c) => {
    expect(validContact(c)).toBe(false);
  });
});

describe("maskContact", () => {
  it("手機只留前四碼與後三碼", () => expect(maskContact("0912-345-678")).toBe("0912-***-678"));
  it("email 只留第一個字", () => expect(maskContact("sage@gmail.com")).toBe("s***@gmail.com"));
});

describe("simulatedStatus", () => {
  it("同一筆通報每次結果都一樣", () => {
    expect(simulatedStatus(seed("R0042", "2026-10-01"))).toEqual(simulatedStatus(seed("R0042", "2026-10-01")));
  });
  it("網頁上新增的通報從待處理開始", () => {
    expect(simulatedStatus({ ...seed("LX", "2026-10-21"), local: true, simulated: undefined })).toEqual({ status: "待處理", updated_at: "2026-10-21" });
  });
  it("越舊的通報，結案比例越高", () => {
    const closed = (date: string) =>
      Array.from({ length: 200 }, (_, i) => simulatedStatus(seed(`R${i}`, date))).filter((s) => s.status === "已結案").length;
    expect(closed("2026-08-25")).toBeGreaterThan(closed("2026-10-15"));
  });
  it("最後更新日不早於通報日", () => {
    for (let i = 0; i < 100; i++) {
      const s = simulatedStatus(seed(`R${i}`, "2026-09-10"));
      expect(s.updated_at >= "2026-09-10").toBe(true);
    }
  });
});

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
  it("政府端改過的進度蓋過模擬值；超過時限未結案算逾期", () => {
    const r = seed("R0001", "2026-10-01");
    const [c] = buildCases([r], { R0001: { status: "處理中", updated_at: "2026-10-20" } }, [], () => "中山區", "2026-10-21");
    expect(c.status).toBe("處理中");
    expect(c.age).toBe(20);
    expect(c.overdue).toBe(20 > SLA_DAYS);
    const [done] = buildCases([r], { R0001: { status: "已結案", updated_at: "2026-10-20" } }, [], () => "中山區", "2026-10-21");
    expect(done.overdue).toBe(false);
  });
  it("依類別分派承辦單位", () => {
    expect(ownerOf("亂丟垃圾", "大安區")).toBe("環保稽查大隊");
    expect(ownerOf("垃圾桶滿溢", "大安區")).toBe("大安區清潔隊");
  });
  it("市民留的聯絡方式只在本機通報上", () => {
    const local: Report = { ...seed("LX", "2026-10-21"), local: true, contact: "0912345678" };
    const [c] = buildCases([local], {}, [], () => "中山區", "2026-10-21");
    expect(c.contact).toBe("0912345678");
  });
});

describe("casesToCsv", () => {
  it("不匯出聯絡方式，說明裡的逗號會加引號", () => {
    const local: Report = { ...seed("LX", "2026-10-21"), local: true, contact: "0912345678", note: "飲料杯,很多" };
    const csv = casesToCsv(buildCases([local], {}, [], () => "中山區", "2026-10-21"), () => "中山區・測試");
    expect(csv).not.toContain("0912345678");
    expect(csv).toContain('"飲料杯,很多"');
    expect(csv.startsWith("﻿通報編號")).toBe(true);
  });
});

describe("fitSize", () => {
  it("長邊縮到 800，不放大小圖", () => {
    expect(fitSize(4000, 3000)).toEqual({ w: 800, h: 600 });
    expect(fitSize(300, 200)).toEqual({ w: 300, h: 200 });
  });
});
