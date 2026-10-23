import { describe, expect, it } from "vitest";
import { explainLevel, type Factor } from "./explain";

const f = (label: string, amount: string, sign: 1 | -1, term: number): Factor => ({ label, amount, sign, present: term !== 0, term });

describe("explainLevel", () => {
  it("有分級：列出影響最大的增加需求情境，並說明沒有東西抵銷", () => {
    const text = explainLevel("缺", [
      f("飲料店（商圈）", "2 家", 1, 0.07),
      f("YouBike 站", "1 站", 1, 0.05),
      f("住宅區", "", -1, 0),
      f("公車站", "2 站", 1, 0.1),
      f("現有垃圾桶", "0 個", -1, 0),
      f("市民反應缺桶數", "1 件", 1, 0.07),
    ]);
    expect(text).toBe(
      "判定為「缺」，主要是因為格內有公車站 2 站、飲料店（商圈） 2 家、市民反應缺桶數 1 件 等，這些都會增加垃圾桶需求，而且格內沒有住宅區、現有垃圾桶，需求沒有被抵銷。"
    );
  });

  it("有分級但也有降低需求的情境", () => {
    const text = explainLevel("有點缺", [f("飲料店（商圈）", "5 家", 1, 0.2), f("現有垃圾桶", "1 個", -1, -0.1)]);
    expect(text).toBe("判定為「有點缺」，主要是因為格內有飲料店（商圈） 5 家，這些都會增加垃圾桶需求；雖然也有現有垃圾桶 1 個會降低需求，但不足以抵銷。");
  });

  it("不缺：沒有增加需求的情境", () => {
    expect(explainLevel(null, [f("飲料店（商圈）", "", 1, 0)])).toBe("這一格裡沒有會增加垃圾桶需求的情境，所以判定為「不缺」。");
  });

  it("不缺：需求被抵銷", () => {
    expect(explainLevel(null, [f("公車站", "1 站", 1, 0.05), f("現有垃圾桶", "2 個", -1, -0.3)])).toBe(
      "這一格雖然有公車站 1 站，但現有垃圾桶 2 個降低了需求，抵銷之後判定為「不缺」。"
    );
  });
});
