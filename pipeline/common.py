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


def round_floats(value, digits: int = 4):
    if isinstance(value, float):
        return round(value, digits) if math.isfinite(value) else None
    return value
