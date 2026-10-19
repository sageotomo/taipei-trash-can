"""步驟 1：讀取 data/raw/ 裡的真實資料，統一成經緯度欄位。

找不到的檔案不會報錯，只會在 build/load_report.json 記下「缺少」，
由 02_simulate.py 補上模擬資料。檔名規則見 data/NOTES.md。
"""

from __future__ import annotations

import pandas as pd

from common import BUILD, RAW, ensure_dirs, write_json

ENCODINGS = ["utf-8-sig", "cp950", "big5"]


def read_csv_any(path) -> pd.DataFrame:
    """開放資料常見 UTF-8 和 Big5 兩種編碼，依序嘗試。"""
    last_error = None
    for enc in ENCODINGS:
        try:
            return pd.read_csv(path, encoding=enc)
        except UnicodeDecodeError as e:
            last_error = e
    raise last_error  # type: ignore[misc]


def find_col(df: pd.DataFrame, *candidates: str) -> str | None:
    cols = {c.strip().lower(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in cols:
            return cols[cand.lower()]
    for cand in candidates:  # 退而求其次：欄位名稱包含關鍵字
        for low, original in cols.items():
            if cand.lower() in low:
                return original
    return None


def require(df: pd.DataFrame, name: str, *candidates: str) -> str:
    col = find_col(df, *candidates)
    if col is None:
        raise ValueError(f"{name}：找不到欄位 {candidates}，實際欄位是 {list(df.columns)}")
    return col


# ---------- 各資料集 ----------

def load_bins() -> pd.DataFrame | None:
    """行人專用清潔箱：data/raw/bins.csv（環保局，欄位含 行政區、路名、經度、緯度）"""
    path = RAW / "bins.csv"
    if not path.exists():
        return None
    df = read_csv_any(path)
    lat = require(df, "清潔箱", "緯度", "lat", "latitude")
    lng = require(df, "清潔箱", "經度", "lng", "longitude")
    district = find_col(df, "行政區", "district")
    road = find_col(df, "路名", "road")
    out = pd.DataFrame({
        "lat": pd.to_numeric(df[lat], errors="coerce"),
        "lng": pd.to_numeric(df[lng], errors="coerce"),
        "district": df[district].astype(str).str.strip() if district else "",
        "road": df[road].astype(str).str.strip() if road else "",
    }).dropna(subset=["lat", "lng"])
    out.insert(0, "id", [f"B{i:04d}" for i in range(1, len(out) + 1)])
    return out


def load_mrt() -> tuple[pd.DataFrame, list[float]] | None:
    """捷運：data/raw/mrt_od.csv（某一個月的分時 OD 檔）＋ data/raw/mrt_stations.csv（站名、lat、lng、district）

    回傳 (各站平均每日進出人次, 24 小時的時段係數)。
    """
    od_path, st_path = RAW / "mrt_od.csv", RAW / "mrt_stations.csv"
    if not (od_path.exists() and st_path.exists()):
        return None

    od = read_csv_any(od_path)
    date = require(od, "捷運 OD", "日期", "date")
    hour = require(od, "捷運 OD", "時段", "hour")
    entry = require(od, "捷運 OD", "進站", "entry")
    exit_ = require(od, "捷運 OD", "出站", "exit")
    count = require(od, "捷運 OD", "人次", "count")
    od[count] = pd.to_numeric(od[count], errors="coerce").fillna(0)
    days = od[date].nunique()

    # 每站人流 = 從這站進 + 從這站出
    flow = (
        od.groupby(entry)[count].sum().add(od.groupby(exit_)[count].sum(), fill_value=0) / max(days, 1)
    ).rename("daily_flow")
    flow.index = flow.index.astype(str).str.replace("站", "", regex=False).str.strip()

    by_hour = od.groupby(pd.to_numeric(od[hour], errors="coerce"))[count].sum().reindex(range(24), fill_value=0)
    hourly = (by_hour / by_hour.mean()).round(4).tolist()

    st = read_csv_any(st_path)
    name = require(st, "捷運站座標", "name", "站名")
    st = pd.DataFrame({
        "name": st[name].astype(str).str.replace("站", "", regex=False).str.strip(),
        "lat": pd.to_numeric(st[require(st, "捷運站座標", "lat", "緯度")], errors="coerce"),
        "lng": pd.to_numeric(st[require(st, "捷運站座標", "lng", "經度")], errors="coerce"),
        "district": st[find_col(st, "district", "行政區")] if find_col(st, "district", "行政區") else "",
    })
    stations = st.merge(flow, left_on="name", right_index=True, how="inner")
    unmatched = sorted(set(st["name"]) - set(flow.index))
    if unmatched:
        print(f"  注意：{len(unmatched)} 個站名在 OD 檔裡找不到：{unmatched[:10]}")
    return stations, hourly


def load_bus() -> pd.DataFrame | None:
    """公車站牌：data/raw/bus_stops.geojson / .csv（含 lat、lng）/ .shp（需要 geopandas）"""
    for suffix in ("geojson", "csv", "shp"):
        path = RAW / f"bus_stops.{suffix}"
        if not path.exists():
            continue
        if suffix == "csv":
            df = read_csv_any(path)
            return pd.DataFrame({
                "lat": pd.to_numeric(df[require(df, "公車站牌", "lat", "緯度")], errors="coerce"),
                "lng": pd.to_numeric(df[require(df, "公車站牌", "lng", "經度")], errors="coerce"),
            }).dropna()
        import geopandas as gpd  # 只有這裡需要，避免沒裝也能跑模擬模式

        gdf = gpd.read_file(path)
        if gdf.crs is not None and gdf.crs.to_epsg() != 4326:
            print(f"  公車站牌座標系 {gdf.crs}，轉成 WGS84")
            gdf = gdf.to_crs(4326)
        pts = gdf.geometry.representative_point()
        return pd.DataFrame({"lat": pts.y, "lng": pts.x}).dropna()
    return None


def main() -> None:
    ensure_dirs()
    report: dict[str, bool] = {}

    bins = load_bins()
    report["bins"] = bins is not None
    if bins is not None:
        bins.to_csv(BUILD / "real_bins.csv", index=False)

    mrt = load_mrt()
    report["mrt"] = mrt is not None
    if mrt is not None:
        stations, hourly = mrt
        stations.to_csv(BUILD / "real_mrt.csv", index=False)
        write_json(BUILD / "real_hourly.json", hourly)

    bus = load_bus()
    report["bus"] = bus is not None
    if bus is not None:
        bus.to_csv(BUILD / "real_bus.csv", index=False)

    write_json(BUILD / "load_report.json", report, compact=False)
    for key, ok in report.items():
        print(f"  {key:6s} {'真實資料' if ok else '找不到，改用模擬'}")


if __name__ == "__main__":
    main()
