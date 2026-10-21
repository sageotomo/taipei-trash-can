import { describe, expect, it } from "vitest";
import { DEFAULT_INDICATORS, type Indicator } from "./indicators";
import { inDefaultOrder } from "./storage";

describe("inDefaultOrder", () => {
  it("存過的設定照預設故事順序排，保留使用者的權重；自訂指標排在後面", () => {
    const custom: Indicator = { id: "c1", label: "公廁", layer: "toilets", method: "count", sign: 1, weight: 0.1, cap: null };
    const saved = [custom, ...[...DEFAULT_INDICATORS].reverse().map((i) => ({ ...i, weight: 0.33 }))];
    const out = inDefaultOrder(saved);
    expect(out.map((i) => i.id)).toEqual([...DEFAULT_INDICATORS.map((i) => i.id), "c1"]);
    expect(out.slice(0, -1).every((i) => i.weight === 0.33)).toBe(true);
  });
});
