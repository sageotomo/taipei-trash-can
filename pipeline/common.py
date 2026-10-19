"""pipeline 共用的路徑、常數與小工具。"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"            # 真實原始檔（不進 git）
BUILD = ROOT / "pipeline" / "build"    # 中間產物（不進 git）
REFERENCE = ROOT / "pipeline" / "reference"
OUT = ROOT / "web" / "public" / "data"  # 給網站讀的 JSON

SEED = 42

# 預設權重：和網頁滑桿的初始值一致
DEFAULT_WEIGHTS = {
    "mrt": 0.30,
    "bus": 0.20,
    "youbike": 0.10,
    "food": 0.20,
    "reports": 0.15,
    "fill": 0.05,
}

M_PER_DEG_LAT = 111_320.0


def ensure_dirs() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, data, compact: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        if compact:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(data, f, ensure_ascii=False, indent=2)


def read_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def offset(lat: np.ndarray | float, lng: np.ndarray | float, dy_m, dx_m):
    """把經緯度往北移 dy_m 公尺、往東移 dx_m 公尺。"""
    lat = np.asarray(lat, dtype=float)
    new_lat = lat + np.asarray(dy_m) / M_PER_DEG_LAT
    new_lng = np.asarray(lng, dtype=float) + np.asarray(dx_m) / (M_PER_DEG_LAT * np.cos(np.radians(lat)))
    return new_lat, new_lng


def haversine_m(lat1, lng1, lat2, lng2):
    """兩點距離（公尺），支援 numpy broadcasting。"""
    r = 6_371_000.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = p2 - p1
    dl = np.radians(lng2) - np.radians(lng1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def normalize_positive(values: pd.Series) -> pd.Series:
    """0 維持 0；大於 0 的值換成在「所有正值」中的百分位數 (0, 1]。

    直接對全部值做百分位數的話，大量的 0 會被排到中間，
    讓「什麼都沒有」的格子也拿到 0.4 分左右，所以 0 要另外處理。
    網頁端的 score.ts 用同一套規則。
    """
    out = pd.Series(0.0, index=values.index)
    positive = values > 0
    if positive.any():
        out[positive] = values[positive].rank(pct=True, method="average")
    return out


def compute_gap(grid: pd.DataFrame, weights: dict[str, float] = DEFAULT_WEIGHTS) -> pd.DataFrame:
    """和 web/src/lib/score.ts 的 computeScores 相同：需求、供給、缺口。

    grid 需要 *_n 欄位（reports 用原始件數，這裡標準化）以及 bins、nbins。
    """
    out = grid.copy()
    out["reports_n"] = normalize_positive(out["reports"])
    out["demand"] = sum(w * out[f"{k}_n"] for k, w in weights.items())
    out["supply"] = out["bins"] + 0.5 * out["nbins"]
    out["gap"] = out["demand"] / (1 + out["supply"])
    return out


def pick_recommendations(scored: pd.DataFrame, weights: dict[str, float] = DEFAULT_WEIGHTS, n: int = 30) -> pd.DataFrame:
    """和 score.ts 的 pickRecommendations 相同：缺口高到低、需求 ≥ 總權重 35%、彼此不相鄰。"""
    from hexgrid import grid_disk

    total = sum(weights.values())
    if total <= 0:
        return scored.iloc[0:0]
    blocked: set[str] = set()
    picks = []
    for row in scored.sort_values("gap", ascending=False).itertuples():
        if len(picks) >= n:
            break
        if row.gap <= 0 or row.demand < 0.35 * total or row.cell in blocked:
            continue
        picks.append(row.Index)
        blocked |= set(grid_disk(row.cell, 1))
    return scored.loc[picks]


def round_floats(value, digits: int = 4):
    if isinstance(value, float):
        return round(value, digits) if math.isfinite(value) else None
    return value
