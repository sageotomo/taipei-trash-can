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
    """行人專用垃圾桶：data/raw/bins.csv（環保局，欄位含 行政區、路名、經度、緯度）"""
    path = RAW / "bins.csv"
    if not path.exists():
        return None
    df = read_csv_any(path)
    lat = require(df, "垃圾桶", "緯度", "lat", "latitude")
    lng = require(df, "垃圾桶", "經度", "lng", "longitude")
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


def load_residential() -> pd.DataFrame | None:
    """住宅區：data/raw/residential.csv（每列一個點，欄位含 緯度、經度）

    建議來源：臺北市都市計畫土地使用分區圖，取「住宅區」的多邊形，
    在每個多邊形內每隔約 100 公尺取一點（或取街廓中心點）後存成 CSV。
    """
    path = RAW / "residential.csv"
    if not path.exists():
        return None
    df = read_csv_any(path)
    return pd.DataFrame({
        "lat": pd.to_numeric(df[require(df, "住宅區", "緯度", "lat", "latitude")], errors="coerce"),
        "lng": pd.to_numeric(df[require(df, "住宅區", "經度", "lng", "longitude")], errors="coerce"),
    }).dropna(subset=["lat", "lng"])


def load_mrt() -> tuple[pd.DataFrame, list[float]] | None:
    """捷運：站點座標 data/raw/mrt_stations.csv（name、lat、lng、district）＋ 人流，人流二選一：

      - data/raw/mrt_od.csv：某一個月的分時 OD 原始檔（日期、時段、進站、出站、人次）
      - data/raw/mrt_daily.csv ＋ mrt_hourly.csv：已彙總好的各站每日進出、全市每小時人次
        （原始月檔約 300 MB，可先在瀏覽器裡彙總，見 data/NOTES.md）

    回傳 (各站平均每日進出人次, 24 小時的時段係數)。
    """
    st_path = RAW / "mrt_stations.csv"
    od_path, daily_path, hourly_path = RAW / "mrt_od.csv", RAW / "mrt_daily.csv", RAW / "mrt_hourly.csv"
    if not st_path.exists() or not (od_path.exists() or (daily_path.exists() and hourly_path.exists())):
        return None

    if od_path.exists():
        od = read_csv_any(od_path)
        date = require(od, "捷運 OD", "日期", "date")
        hour = require(od, "捷運 OD", "時段", "hour")
        entry = require(od, "捷運 OD", "進站", "entry")
        exit_ = require(od, "捷運 OD", "出站", "exit")
        count = require(od, "捷運 OD", "人次", "count")
        od[count] = pd.to_numeric(od[count], errors="coerce").fillna(0)
        days = od[date].nunique()
        # 每站人流 = 從這站進 + 從這站出
        flow = od.groupby(entry)[count].sum().add(od.groupby(exit_)[count].sum(), fill_value=0) / max(days, 1)
        by_hour = od.groupby(pd.to_numeric(od[hour], errors="coerce"))[count].sum().reindex(range(24), fill_value=0)
    else:
        daily = read_csv_any(daily_path)
        flow = pd.Series(
            (daily["entries"] + daily["exits"]).values / daily["days"].values, index=daily["name"].astype(str)
        )
        by_hour = read_csv_any(hourly_path).set_index("hour")["count"].reindex(range(24), fill_value=0)

    flow = flow.rename("daily_flow")
    flow.index = flow.index.astype(str).map(normalize_station)
    flow = flow.groupby(level=0).sum()
    hourly = (by_hour / by_hour.mean()).round(4).tolist()

    st = read_csv_any(st_path)
    st = pd.DataFrame({
        "name": st[require(st, "捷運站座標", "name", "站名")].astype(str),
        "lat": pd.to_numeric(st[require(st, "捷運站座標", "lat", "緯度")], errors="coerce"),
        "lng": pd.to_numeric(st[require(st, "捷運站座標", "lng", "經度")], errors="coerce"),
        "district": st[find_col(st, "district", "行政區")] if find_col(st, "district", "行政區") else "",
    })
    st["key"] = st["name"].map(normalize_station)
    stations = st.merge(flow, left_on="key", right_index=True, how="left").drop(columns="key")
    missing = stations[stations["daily_flow"].isna()]["name"].tolist()
    if missing:
        print(f"  注意：{len(missing)} 個站名在人流資料裡找不到，人流記為 0：{missing}")
    stations["daily_flow"] = stations["daily_flow"].fillna(0)
    return stations, hourly


def normalize_station(name: str) -> str:
    """站名正規化：去掉「站」、臺→台、空白，讓座標檔和人流檔的站名對得上"""
    return str(name).strip().replace("臺", "台").removesuffix("站").replace(" ", "")


def load_bus() -> pd.DataFrame | None:
    """公車站牌：data/raw/bus_stops.csv（含 lat、lng，可選 name）/ .geojson / .shp（需要 geopandas）"""
    for suffix in ("csv", "geojson", "shp"):
        path = RAW / f"bus_stops.{suffix}"
        if not path.exists():
            continue
        if suffix == "csv":
            df = read_csv_any(path)
            name = find_col(df, "name", "站名", "BSM_CHINES")
            return pd.DataFrame({
                "lat": pd.to_numeric(df[require(df, "公車站牌", "lat", "緯度")], errors="coerce"),
                "lng": pd.to_numeric(df[require(df, "公車站牌", "lng", "經度")], errors="coerce"),
                "name": df[name].astype(str) if name else "",
            }).dropna(subset=["lat", "lng"])
        import geopandas as gpd  # 只有這裡需要，避免沒裝也能跑模擬模式

        gdf = gpd.read_file(path)
        if gdf.crs is not None and gdf.crs.to_epsg() != 4326:
            print(f"  公車站牌座標系 {gdf.crs}，轉成 WGS84")
            gdf = gdf.to_crs(4326)
        pts = gdf.geometry.representative_point()
        return pd.DataFrame({"lat": pts.y, "lng": pts.x, "name": ""}).dropna(subset=["lat", "lng"])
    return None


def load_youbike() -> pd.DataFrame | None:
    """YouBike 2.0 站點：data/raw/youbike.csv（交通局即時資訊的快照：sno、name、district、lat、lng、docks）"""
    path = RAW / "youbike.csv"
    if not path.exists():
        return None
    df = read_csv_any(path)
    return pd.DataFrame({
        "lat": pd.to_numeric(df[require(df, "YouBike", "lat", "latitude")], errors="coerce"),
        "lng": pd.to_numeric(df[require(df, "YouBike", "lng", "longitude")], errors="coerce"),
        "name": df[require(df, "YouBike", "name", "sna")].astype(str),
        "docks": pd.to_numeric(df[find_col(df, "docks", "Quantity")], errors="coerce").fillna(0).astype(int)
        if find_col(df, "docks", "Quantity") else 0,
    }).dropna(subset=["lat", "lng"])


def load_shops() -> pd.DataFrame | None:
    """飲料店與餐飲店，兩個都要有才使用：

      - data/raw/drink_shops.csv：環保局「臺北市飲料杯空杯回收點」（飲料店門市，含經緯度）
      - data/raw/food_businesses.csv：產業局「設址臺北市所營事業含餐館業清冊」（含經緯度）
    """
    drink_path, food_path = RAW / "drink_shops.csv", RAW / "food_businesses.csv"
    if not (drink_path.exists() and food_path.exists()):
        return None
    d = read_csv_any(drink_path)
    drinks = pd.DataFrame({
        "lat": pd.to_numeric(d[require(d, "飲料店", "緯度", "lat")], errors="coerce"),
        "lng": pd.to_numeric(d[require(d, "飲料店", "經度", "lng")], errors="coerce"),
        "name": (d[require(d, "飲料店", "品牌名稱")].astype(str) + " " + d[require(d, "飲料店", "門市名稱")].astype(str)).str.strip(),
        "type": "drink",
    })
    f = read_csv_any(food_path)
    foods = pd.DataFrame({
        "lat": pd.to_numeric(f[require(f, "餐飲店", "Latitude", "緯度")], errors="coerce"),
        "lng": pd.to_numeric(f[require(f, "餐飲店", "Longitude", "經度")], errors="coerce"),
        "name": f[require(f, "餐飲店", "商業名稱")].astype(str).str.strip(),
        "type": "food",
    })
    shops = pd.concat([drinks, foods], ignore_index=True).dropna(subset=["lat", "lng"])
    # 只留台北市範圍（排除座標錯誤的資料）
    shops = shops[shops["lat"].between(24.95, 25.22) & shops["lng"].between(121.45, 121.67)]
    return shops.reset_index(drop=True)


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

    youbike = load_youbike()
    report["youbike"] = youbike is not None
    if youbike is not None:
        youbike.to_csv(BUILD / "real_youbike.csv", index=False)

    shops = load_shops()
    report["shops"] = shops is not None
    if shops is not None:
        shops.to_csv(BUILD / "real_shops.csv", index=False)

    residential = load_residential()
    report["residential"] = residential is not None
    if residential is not None:
        residential.to_csv(BUILD / "real_residential.csv", index=False)

    write_json(BUILD / "load_report.json", report, compact=False)
    counts = {"bins": bins, "mrt": mrt[0] if mrt else None, "bus": bus, "youbike": youbike, "shops": shops,
              "residential": residential}
    for key, ok in report.items():
        n = len(counts[key]) if counts.get(key) is not None else 0
        print(f"  {key:8s} {f'真實資料 {n} 筆' if ok else '找不到，改用模擬'}")


if __name__ == "__main__":
    main()
