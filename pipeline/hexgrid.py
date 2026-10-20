"""自訂的正六角形網格（取代 H3）。

H3 的六角形是依地球的二十面體排列的，在台北會呈現歪斜的角度。
這裡改用以台北為中心的平面座標，切出「尖頂朝北」的正六角形，畫在地圖上是端正的。

  - 座標：以 (LAT0, LNG0) 為原點的等距平面（公尺），台北市範圍內誤差 < 0.1%
  - 格子：axial 座標 (q, r)，格子編號寫成 "q_r"
  - 大小：SIZE_M = 中心到頂點的距離（公尺）

web/src/lib/hexgrid.ts 是同一套演算法的 TypeScript 版，兩邊的常數必須相同。
演算法參考 https://www.redblobgames.com/grids/hexagons/
"""

from __future__ import annotations

import math

import numpy as np

SIZE_M = 150.0          # 中心到頂點的距離
LAT0, LNG0 = 25.05, 121.55
M_PER_DEG_LAT = 6_371_000 * math.pi / 180  # 球面地球，和距離計算（haversine）一致
M_PER_DEG_LNG = M_PER_DEG_LAT * math.cos(math.radians(LAT0))
SQRT3 = math.sqrt(3)

# 六個相鄰格的方向
DIRECTIONS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]


def cell_id(q: int, r: int) -> str:
    return f"{q}_{r}"


def parse(cell: str) -> tuple[int, int]:
    q, r = cell.split("_")
    return int(q), int(r)


def _round_half_up(v):
    # 和 JavaScript 的 Math.round 相同（Python 的 round 是銀行家捨入）
    return np.floor(np.asarray(v, dtype=float) + 0.5)


def latlng_to_cells(lat, lng) -> list[str]:
    """一批經緯度 → 格子編號（numpy 向量化）"""
    x = (np.asarray(lng, dtype=float) - LNG0) * M_PER_DEG_LNG
    y = (np.asarray(lat, dtype=float) - LAT0) * M_PER_DEG_LAT
    qf = (SQRT3 / 3 * x - y / 3) / SIZE_M
    rf = (2 / 3 * y) / SIZE_M
    sf = -qf - rf
    q, r, s = _round_half_up(qf), _round_half_up(rf), _round_half_up(sf)
    dq, dr, ds = np.abs(q - qf), np.abs(r - rf), np.abs(s - sf)
    fix_q = (dq > dr) & (dq > ds)
    fix_r = ~fix_q & (dr > ds)
    q = np.where(fix_q, -r - s, q)
    r = np.where(fix_r, -q - s, r)
    return [cell_id(int(a), int(b)) for a, b in zip(np.atleast_1d(q), np.atleast_1d(r))]


def latlng_to_cell(lat: float, lng: float) -> str:
    return latlng_to_cells([lat], [lng])[0]


def cell_center(cell: str) -> tuple[float, float]:
    q, r = parse(cell)
    x = SIZE_M * SQRT3 * (q + r / 2)
    y = SIZE_M * 1.5 * r
    return LAT0 + y / M_PER_DEG_LAT, LNG0 + x / M_PER_DEG_LNG


def cell_boundary(cell: str) -> list[tuple[float, float]]:
    """六個頂點（緯度, 經度），尖頂朝北"""
    lat, lng = cell_center(cell)
    pts = []
    for i in range(6):
        a = math.radians(60 * i - 30)
        pts.append((lat + SIZE_M * math.sin(a) / M_PER_DEG_LAT, lng + SIZE_M * math.cos(a) / M_PER_DEG_LNG))
    return pts


def grid_disk(cell: str, k: int) -> list[str]:
    """距離 k 圈以內的所有格子（含自己）"""
    q, r = parse(cell)
    out = []
    for dq in range(-k, k + 1):
        for dr in range(max(-k, -dq - k), min(k, -dq + k) + 1):
            out.append(cell_id(q + dq, r + dr))
    return out
