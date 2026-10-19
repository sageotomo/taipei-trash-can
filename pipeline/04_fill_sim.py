"""步驟 4：模擬 7 天 × 24 小時的垃圾桶填滿過程，比較兩種清運策略。

假設每個現有清潔箱都裝了填滿感測器（主辦說明這份資料不存在，可以模擬）。

  每小時增加量 = 該桶的填滿速度 × 時段係數 × 週末係數 + 雜訊
  時段係數來自捷運分時進出量（有真實資料就用真實的）

  A 固定排程：每天 06:00、14:00、22:00 清一次（模擬現行的定時巡邏）
  B 感測派車：填到 80% 就派車，下一個小時清空

輸出 web/public/data/fill.json，順序和 bins.geojson 相同。
"""

from __future__ import annotations

import numpy as np

from common import BUILD, OUT, SEED, read_json, write_json

HOURS = 7 * 24
FIXED_HOURS = (6, 14, 22)
DISPATCH_AT = 0.8
WEEKEND_FACTOR = 1.15  # 週末商圈人多一點


def simulate(rates: np.ndarray, hourly: list[float], strategy: str, rng: np.random.Generator):
    """回傳 (levels[桶, 小時] 0–1 以上, trips[桶], overflow_hours[桶])"""
    n = len(rates)
    level = rng.uniform(0.1, 0.4, n)
    levels = np.zeros((n, HOURS))
    trips = np.zeros(n, dtype=int)
    overflow = np.zeros(n, dtype=int)
    pending = np.zeros(n, dtype=bool)  # B：已經派車，下一小時清空

    for t in range(HOURS):
        hour, day = t % 24, t // 24
        factor = hourly[hour] * (WEEKEND_FACTOR if day >= 5 else 1.0)

        if strategy == "A" and hour in FIXED_HOURS:
            level[:] = 0
            trips += 1
        if strategy == "B" and pending.any():
            level[pending] = 0
            trips += pending
            pending[:] = False

        level = np.maximum(level + rates * factor + rng.normal(0, 0.01, n), 0)
        levels[:, t] = level
        overflow += level >= 1.0

        if strategy == "B":
            pending = level >= DISPATCH_AT

    return levels, trips, overflow


def main() -> None:
    bins = read_json(OUT / "bins.geojson")["features"]
    hourly = read_json(BUILD / "hourly.json")
    rates = np.array([f["properties"]["fill_rate"] for f in bins])

    result = {"hours": HOURS, "fixed_hours": FIXED_HOURS, "dispatch_at": DISPATCH_AT, "hourly": hourly,
              "levels": {}, "overflow": {}, "trips": {}, "summary": {}}
    for strategy in ("A", "B"):
        rng = np.random.default_rng(SEED)  # 兩種策略用同一串亂數，公平比較
        levels, trips, overflow = simulate(rates, hourly, strategy, rng)
        # 存成 0–100 的整數（超過 100 一律記 100，代表滿溢），檔案小很多
        result["levels"][strategy] = np.clip(np.round(levels * 100), 0, 100).astype(int).tolist()
        result["overflow"][strategy] = overflow.tolist()
        result["trips"][strategy] = trips.tolist()
        result["summary"][strategy] = {
            "overflow_hours": int(overflow.sum()),
            "trips": int(trips.sum()),
            "bins_ever_full": int((overflow > 0).sum()),
        }
        s = result["summary"][strategy]
        print(f"  策略 {strategy}：滿溢 {s['overflow_hours']} 桶時、出車 {s['trips']} 次、曾經滿溢 {s['bins_ever_full']} 桶")

    write_json(OUT / "fill.json", result)


if __name__ == "__main__":
    main()
