import { describe, expect, it } from "vitest";
import { WEEKS, makeProgressHistory, shortDate } from "./progress";
import type { CellResult } from "./indicators";

const pick = (cells: string[]) => cells.map((cell) => ({ cell }) as CellResult);
const district = () => "大安區";

describe("makeProgressHistory", () => {
  // 第一週 A–E；第二週 E 掉出、F 新進；第三週 D 掉出、G 新進
  const rankings = [pick(["A", "B", "C", "D", "E"]), pick(["A", "B", "C", "D", "F"]), pick(["A", "B", "C", "F", "G"])];
  const history = makeProgressHistory(rankings, district);

  it("每週一份快照，順序同 WEEKS", () => {
    expect(history.map((s) => s.week.start)).toEqual(WEEKS.map((w) => w.start));
  });

  it("前 30 名照名次排在前面", () => {
    history.forEach((s, w) => {
      expect(s.items.slice(0, 5).map((p) => p.cell)).toEqual(rankings[w].map((p) => p.cell));
      expect(s.items.slice(0, 5).map((p) => p.rank)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  it("新進的點從未處理開始，並記在 added", () => {
    expect(history[1].added.map((p) => p.cell)).toEqual(["F"]);
    expect(history[1].items.find((p) => p.cell === "F")?.status).toBe("未處理");
    expect(history[0].added).toEqual([]);
  });

  it("掉出前 30 名：還沒動工就移出，已動工就留著、名次為 null", () => {
    for (let w = 1; w < history.length; w++) {
      const top = new Set(rankings[w].map((p) => p.cell));
      for (const p of history[w].items.filter((p) => !top.has(p.cell))) {
        expect(p.rank).toBeNull();
        expect(["施工中", "已設置"]).toContain(p.status);
      }
      for (const p of history[w].removed) expect(["未處理", "規劃中"]).toContain(p.status);
    }
  });

  it("狀態只會往前，不會倒退", () => {
    const order = ["未處理", "規劃中", "施工中", "已設置"];
    for (let w = 1; w < history.length; w++) {
      for (const p of history[w].items) {
        const before = history[w - 1].items.find((q) => q.cell === p.cell);
        if (before) expect(order.indexOf(p.status)).toBeGreaterThanOrEqual(order.indexOf(before.status));
      }
    }
  });

  it("固定種子，結果每次一樣", () => {
    expect(makeProgressHistory(rankings, district)).toEqual(history);
  });
});

describe("shortDate", () => {
  it("去掉年份和前面的 0", () => {
    expect(shortDate("2026-10-05")).toBe("10/5");
  });
});
