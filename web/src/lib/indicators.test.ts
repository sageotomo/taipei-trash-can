import { describe, expect, it } from "vitest";
import { cellCenter, gridDisk, latLngToCell } from "./hexgrid";
import {
  DEFAULT_INDICATORS,
  aggregate,
  autoCap,
  cellUniverse,
  dedupeIndicators,
  freeMethods,
  computeIndex,
  levelOf,
  niceNumber,
  pickRecommendations,
  type DataLayer,
  type Indicator,
} from "./indicators";

const icon = { glyph: "pin", color: "#000" };
const C = latLngToCell(25.0478, 121.517); // 台北車站那一格

function layer(id: string, pts: { cell: string; values?: Record<string, number> }[], fields: DataLayer["fields"] = []): DataLayer {
  return {
    id, label: id, unit: "個", icon, fields,
    points: pts.map((p) => {
      const [lat, lng] = cellCenter(p.cell);
      return { lat, lng, cell: p.cell, values: p.values };
    }),
  };
}
const many = (cell: string, n: number, values?: Record<string, number>) => Array.from({ length: n }, () => ({ cell, values }));

function run(layers: DataLayer[], indicators: Indicator[]) {
  const agg = aggregate(layers);
  return computeIndex(agg, cellUniverse(agg), indicators);
}

describe("computeIndex", () => {
  it("分數 = min(格內數值 ÷ 上限, 1)，正向加、負向扣", () => {
    const shops = layer("shops", many(C, 30));
    const bins = layer("bins", many(C, 1));
    const result = run([shops, bins], [
      { id: "s", label: "店家", layer: "shops", method: "count", sign: 1, weight: 0.5, cap: 20 },
      { id: "b", label: "垃圾桶", layer: "bins", method: "count", sign: -1, weight: 0.4, cap: 2 },
    ]);
    const r = result.byCell.get(C)!;
    expect(r.score).toEqual([1, 0.5]);          // 30 家超過上限 20 → 1；1 個 ÷ 2 → 0.5
    expect(r.term[0]).toBeCloseTo(0.5);
    expect(r.term[1]).toBeCloseTo(-0.2);
    expect(r.value).toBeCloseTo(0.3);
    expect(result.maxPossible).toBeCloseTo(0.5);
  });

  it("結果低於 0 算 0，而且沒有名次", () => {
    const result = run([layer("shops", many(C, 1)), layer("bins", many(C, 3))], [
      { id: "s", label: "店家", layer: "shops", method: "count", sign: 1, weight: 0.1, cap: 10 },
      { id: "b", label: "垃圾桶", layer: "bins", method: "count", sign: -1, weight: 0.4, cap: 2 },
    ]);
    const r = result.byCell.get(C)!;
    expect(r.value).toBe(0);
    expect(r.rank).toBe(0);
  });

  it("只算格內：隔壁格的桶不會扣這一格的分", () => {
    const next = gridDisk(C, 1).find((c) => c !== C)!;
    const result = run([layer("shops", many(C, 5)), layer("bins", many(next, 5))], [
      { id: "s", label: "店家", layer: "shops", method: "count", sign: 1, weight: 0.5, cap: 5 },
      { id: "b", label: "垃圾桶", layer: "bins", method: "count", sign: -1, weight: 0.5, cap: 1 },
    ]);
    expect(result.byCell.get(C)!.value).toBeCloseTo(0.5);
    expect(result.byCell.get(next)!.value).toBe(0);
  });

  it("關掉的指標不計分，但權重保留；打開就恢復", () => {
    const layers = [layer("shops", many(C, 10)), layer("bins", many(C, 1))];
    const shops: Indicator = { id: "s", label: "店家", layer: "shops", method: "count", sign: 1, weight: 0.5, cap: 10 };
    const bins: Indicator = { id: "b", label: "垃圾桶", layer: "bins", method: "count", sign: -1, weight: 0.4, cap: 1 };
    const off = run(layers, [shops, { ...bins, enabled: false }]);
    expect(off.byCell.get(C)!.value).toBeCloseTo(0.5);   // 垃圾桶關掉，不扣分
    expect(Math.abs(off.byCell.get(C)!.term[1])).toBe(0);
    const offPlus = run(layers, [{ ...shops, enabled: false }, bins]);
    expect(offPlus.maxPossible).toBe(0);                    // 關掉的正向指標不算進理論最大值
    const back = run(layers, [shops, { ...bins, enabled: true }]);
    expect(back.byCell.get(C)!.value).toBeCloseTo(0.1);
  });

  it("欄位加總：同一個圖層可以有「人流加總」和「站數」兩個指標", () => {
    const mrt = layer("mrt", [{ cell: C, values: { flow: 60_000 } }], [{ key: "flow", label: "人流", unit: "人次" }]);
    const result = run([mrt], [
      { id: "f", label: "人流", layer: "mrt", method: "sum", field: "flow", sign: 1, weight: 0.3, cap: 30_000 },
      { id: "n", label: "站內有桶", layer: "mrt", method: "count", sign: -1, weight: 0.2, cap: 1 },
    ]);
    expect(result.byCell.get(C)!.value).toBeCloseTo(0.1);
  });

  it("開根號：分數 = √(格內數值 ÷ 上限)，自動上限取最大值", () => {
    const [a, b, c] = gridDisk(C, 1);
    const mrt = layer("mrt", [
      { cell: a, values: { flow: 300_000 } },
      { cell: b, values: { flow: 75_000 } },
      { cell: c, values: { flow: 3_000 } },
    ], [{ key: "flow", label: "人流", unit: "人次" }]);
    const result = run([mrt], [
      { id: "f", label: "人流", layer: "mrt", method: "sum", field: "flow", sign: 1, weight: 1, cap: null, curve: "sqrt" },
    ]);
    expect(result.stats[0].cap).toBe(300_000);              // 最大的那格
    expect(result.byCell.get(a)!.score[0]).toBeCloseTo(1);
    expect(result.byCell.get(b)!.score[0]).toBeCloseTo(0.5); // √(1/4)
    expect(result.byCell.get(c)!.score[0]).toBeCloseTo(0.1); // √(1/100)
  });

  it("預設指標不含捷運人流（和飲料店重複計算）", () => {
    expect(DEFAULT_INDICATORS.find((i) => i.id === "mrt_flow")).toBeUndefined();
  });

  it("上限留白時自動取第 90 百分位", () => {
    const cells = gridDisk(C, 1); // 7 格，各有 1~7 家
    const shops = layer("shops", cells.flatMap((c, i) => many(c, i + 1)));
    const result = run([shops], [{ id: "s", label: "店家", layer: "shops", method: "count", sign: 1, weight: 1, cap: null }]);
    expect(result.stats[0].auto).toBe(true);
    expect(result.stats[0].cap).toBe(6);
    expect(result.stats[0].fullShare).toBeCloseTo(2 / 7);
  });
});

describe("autoCap / niceNumber", () => {
  it("取整成好讀的數字", () => {
    expect(niceNumber(31_250)).toBe(31_000);
    expect(niceNumber(23.4)).toBe(23);
    expect(niceNumber(0.137)).toBe(0.14);
  });
  it("計數至少是 1；全部是 0 時上限是 1", () => {
    expect(autoCap([0, 0, 0.2], "count")).toBe(1);
    expect(autoCap([0, 0], "sum")).toBe(1);
  });
});

describe("pickRecommendations", () => {
  const ind: Indicator[] = [{ id: "s", label: "店家", layer: "shops", method: "count", sign: 1, weight: 1, cap: 10 }];

  it("不會挑到相鄰的格子", () => {
    const disk = gridDisk(C, 1);
    const shops = layer("shops", disk.flatMap((c) => many(c, c === C ? 10 : 9)));
    expect(pickRecommendations(run([shops], ind)).map((p) => p.cell)).toEqual([C]);
  });

  it("權重全為 0 時沒有建議點", () => {
    const shops = layer("shops", many(C, 5));
    expect(pickRecommendations(run([shops], [{ ...ind[0], weight: 0 }]))).toEqual([]);
  });
});

describe("levelOf", () => {
  it("依佔理論最大值的比例分級，0 是不缺", () => {
    expect(levelOf(0, 1)).toBe(-1);
    expect(levelOf(0.1, 1)).toBe(0);
    expect(levelOf(0.2, 1)).toBe(1);
    expect(levelOf(0.4, 1)).toBe(2);
    expect(levelOf(0.9, 1)).toBe(3);
  });
});

describe("同一圖層、同一算法不重複", () => {
  const base: Indicator = { id: "a", label: "公車站", layer: "bus", method: "count", sign: 1, weight: 0.2, cap: null };

  it("dedupeIndicators 保留第一個", () => {
    const list = [base, { ...base, id: "b", sign: -1 as const }, { ...base, id: "c", layer: "mrt" }];
    expect(dedupeIndicators(list).map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("freeMethods 只回傳還沒用過的算法", () => {
    const mrt = layer("mrt", [], [{ key: "flow", label: "人流", unit: "人次" }]);
    expect(freeMethods(mrt, [])).toEqual(["count", "sum:flow"]);
    expect(freeMethods(mrt, [{ ...base, layer: "mrt" }])).toEqual(["sum:flow"]);
    expect(freeMethods(layer("bus", []), [base])).toEqual([]);
  });
});

describe("indicatorSource", () => {
  it("加總欄位時用欄位自己的來源（真實垃圾桶上的模擬填滿速度）", async () => {
    const { indicatorSource } = await import("./indicators");
    const bins: DataLayer = {
      id: "bins", label: "垃圾桶", unit: "個", icon, source: "bins", points: [],
      fields: [{ key: "fill", label: "填滿速度", unit: "%/小時", source: "fill" }],
    };
    const base = { id: "x", label: "x", layer: "bins", sign: 1 as const, weight: 0.1, cap: null };
    expect(indicatorSource({ ...base, method: "count" }, bins)).toBe("bins");
    expect(indicatorSource({ ...base, method: "sum", field: "fill" }, bins)).toBe("fill");
  });
});
