"""步驟 5：施政進度（模擬）。

假設市府採納了「預設權重下的建議增設前 30 名」，並隨機指定每個點目前的狀態。
真實情況下，這份資料應該由環保局每週更新（見 README 的 100 天落地方案）。
"""

from __future__ import annotations

import h3
import numpy as np
import pandas as pd

from common import OUT, SEED, compute_gap, pick_recommendations, read_json, write_json

STATUSES = ["已設置", "施工中", "規劃中", "未處理"]
STATUS_P = [0.3, 0.2, 0.27, 0.23]


def main() -> None:
    grid = pd.DataFrame(read_json(OUT / "grid.json"))
    picks = pick_recommendations(compute_gap(grid))

    rng = np.random.default_rng(SEED)
    status = rng.choice(STATUSES, len(picks), p=STATUS_P)
    # 越前面完成的點，更新日期越早；未處理的點顯示建議提出的日期
    days_ago = rng.integers(3, 75, len(picks))
    updated = (pd.Timestamp("2026-10-19") - pd.to_timedelta(days_ago, unit="D")).strftime("%Y-%m-%d")

    items = []
    for rank, (row, st, day) in enumerate(zip(picks.itertuples(), status, updated), start=1):
        lat, lng = h3.cell_to_latlng(row.h3)
        items.append({
            "rank": rank,
            "h3": row.h3,
            "lat": round(lat, 5),
            "lng": round(lng, 5),
            "district": row.district,
            "status": str(st),
            "updated_at": day,
            "owner": f"{row.district}清潔隊",
            "simulated": True,
        })

    write_json(OUT / "progress.json", items)
    done = sum(i["status"] == "已設置" for i in items)
    print(f"  建議點 {len(items)} 個，已設置 {done} 個")


if __name__ == "__main__":
    main()
