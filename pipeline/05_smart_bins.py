"""步驟 5：替每個垃圾桶模擬智慧垃圾桶的設備資料（電量、廠牌、贊助商）。

主辦說明智慧垃圾桶資料不存在，所以全部模擬，固定 seed，每次結果相同。
廠牌與贊助商都是虛構名稱，避免被誤認成真實廠商。

  電量：大多 40–100%，約 8% 低於 20%（該換電池或太陽能板被遮）
  廠牌：三家虛構廠商，比例 5:3:2
  贊助商：約一半是市府自設，其餘由商家或團體認養

輸出 web/public/data/smart_bins.json，順序和 bins.geojson 相同，
並在 web/public/data/sources.json 補上 smart_bins 這筆來源標示。
"""

from __future__ import annotations

import numpy as np

from common import OUT, SEED, read_json, write_json

BRANDS = ["綠循科技 GreenLoop", "城感智能 CitySense", "淨點工業 CleanDot"]
BRAND_WEIGHTS = [0.5, 0.3, 0.2]

SPONSORS = ["市府自設", "便利商店認養", "飲料店認養", "里辦公處認養", "商圈協會認養", "在地企業認養"]
SPONSOR_WEIGHTS = [0.5, 0.14, 0.12, 0.1, 0.08, 0.06]

LOW_BATTERY_SHARE = 0.08

SOURCE = {
    "key": "smart_bins",
    "label": "智慧垃圾桶設備資料",
    "real": False,
    "note": "主辦說明這份資料不存在。電量大多在 40–100%，約 8% 低於 20%；廠牌是三家虛構廠商，比例 5:3:2；贊助商約一半是市府自設，其餘是商家或團體認養。廠牌與贊助商名稱都是虛構的。",
}


def simulate(n: int, rng: np.random.Generator) -> list[dict]:
    battery = rng.uniform(40, 100, n)
    low = rng.random(n) < LOW_BATTERY_SHARE
    battery[low] = rng.uniform(3, 19, low.sum())
    brand = rng.choice(len(BRANDS), n, p=BRAND_WEIGHTS)
    sponsor = rng.choice(len(SPONSORS), n, p=SPONSOR_WEIGHTS)
    return [
        {"battery": int(round(b)), "brand": BRANDS[br], "sponsor": SPONSORS[sp]}
        for b, br, sp in zip(battery, brand, sponsor)
    ]


def main() -> None:
    bins = read_json(OUT / "bins.geojson")["features"]
    rng = np.random.default_rng(SEED + 5)
    write_json(OUT / "smart_bins.json", simulate(len(bins), rng))

    sources = [s for s in read_json(OUT / "sources.json") if s["key"] != SOURCE["key"]]
    write_json(OUT / "sources.json", [*sources, SOURCE], compact=False)
    print(f"smart_bins.json：{len(bins)} 桶")


if __name__ == "__main__":
    main()
