import { describe, expect, it } from "vitest";
import { checkQrReport, parseTaipei, taipeiDate, taipeiDateTime } from "./qrReport";
import { toReports } from "./qrFeed";
import type { BinProps, FeatureCollection } from "../types";

// 2026-10-21 23:00 台灣時間
const NOW = Date.UTC(2026, 9, 21, 15, 0);
const ok = { bin: "B0365", category: "垃圾桶滿溢", occurredAt: "2026-10-21T22:30", note: " 滿了 ", contact: "", token: "t" };

describe("台灣時間", () => {
  it("和 UTC 互轉", () => {
    expect(parseTaipei("2026-10-21T23:00")).toBe(NOW);
    expect(taipeiDateTime(NOW)).toBe("2026-10-21T23:00");
    expect(taipeiDate(Date.UTC(2026, 9, 21, 16, 30))).toBe("2026-10-22"); // UTC 16:30 已是台灣隔天
    expect(parseTaipei("2026-13-01T00:00")).toBeNaN();
    expect(parseTaipei("2026-10-21 23:00")).toBeNaN();
  });
});

describe("checkQrReport", () => {
  it("合法內容會整理後通過", () => {
    const r = checkQrReport(ok, NOW);
    expect(r.ok && r.value.note).toBe("滿了");
  });

  it.each([
    ["不是物件", null],
    ["陣列", []],
    ["桶編號亂填", { ...ok, bin: "../etc" }],
    ["類別不在清單", { ...ok, category: "其他" }],
    ["未來時間", { ...ok, occurredAt: "2026-10-22T08:00" }],
    ["超過 30 天", { ...ok, occurredAt: "2026-09-01T08:00" }],
    ["說明太長", { ...ok, note: "字".repeat(201) }],
    ["聯絡方式亂填", { ...ok, contact: "<script>" }],
    ["沒有驗證碼", { ...ok, token: "" }],
    ["欄位型別錯", { ...ok, note: 123, category: ["垃圾桶滿溢"] }],
  ])("拒絕：%s", (_, body) => {
    expect(checkQrReport(body, NOW).ok).toBe(false);
  });

  it("接受 email 和電話", () => {
    expect(checkQrReport({ ...ok, contact: "a@b.tw" }, NOW).ok).toBe(true);
    expect(checkQrReport({ ...ok, contact: "0912-345-678" }, NOW).ok).toBe(true);
  });

  it("拿掉控制字元和隱藏的方向字元", () => {
    const r = checkQrReport({ ...ok, note: "a‮b\u0000c" }, NOW);
    expect(r.ok && r.value.note).toBe("abc");
  });
});

describe("toReports", () => {
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
  it("用桶的座標，找不到的桶略過", () => {
    const out = toReports(
      [
        { id: "Q1021-AAAA", bin: "B0365", category: "亂丟垃圾", note: "", occurred_at: "2026-10-21T22:00", created_at: "2026-10-21", has_contact: true },
        { id: "Q1021-BBBB", bin: "B9999", category: "亂丟垃圾", note: "", occurred_at: "2026-10-21T22:00", created_at: "2026-10-21", has_contact: false },
      ],
      bins
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ lat: 25.04106, lng: 121.56649, cell: "9_-5", qr: true, district: "信義區", has_contact: true });
    expect(out[0].contact).toBeUndefined();
  });
});
