"""步驟 2：補齊模擬資料。

原則：模擬資料都從（真實或近似的）捷運人流推出來，人流越大的地方，
公車站、店家越多，所以熱點會落在合理的位置。固定 seed，每次結果都一樣。

輸出到 pipeline/build/：
  stations.csv  bins.csv  bus.csv  youbike.csv  shops.csv  reports.csv  residential.csv
  hourly.json   area.json（研究範圍的格子）  sources.json
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from common import BUILD, REFERENCE, SEED, ensure_dirs, haversine_m, offset, read_json, write_json
from hexgrid import cell_center, grid_disk, latlng_to_cell, latlng_to_cells

N_BINS = 800          # 主辦說明：目前約 800 組
N_SPREAD_BUS = 1200   # 研究範圍內平均撒的公車站
N_REPORTS = 260
N_RESIDENTIAL = 700   # 住宅街廓的代表點
AREA_RINGS = 5        # 每個捷運站往外 5 圈（約 1.6 公里）當研究範圍

NIGHT_MARKETS = [
    ("士林夜市", 25.0880, 121.5241),
    ("饒河夜市", 25.0505, 121.5774),
    ("寧夏夜市", 25.0563, 121.5155),
    ("臨江街夜市", 25.0301, 121.5545),
    ("南機場夜市", 25.0297, 121.5025),
    ("華西街夜市", 25.0371, 121.4983),
]

REPORT_CATEGORIES = ["亂丟垃圾", "垃圾桶滿溢", "家戶垃圾棄置"]
REPORT_WEIGHTS = [0.5, 0.25, 0.25]


def scatter(rng, lat, lng, n, sd_m):
    """在 (lat, lng) 附近撒 n 個點，距離是標準差 sd_m 公尺的常態分布。"""
    dy = rng.normal(0, sd_m, n)
    dx = rng.normal(0, sd_m, n)
    return offset(np.full(n, lat), np.full(n, lng), dy, dx)


def nearest_district(lat, lng, stations: pd.DataFrame) -> np.ndarray:
    d = haversine_m(np.asarray(lat)[:, None], np.asarray(lng)[:, None],
                    stations["lat"].values[None, :], stations["lng"].values[None, :])
    return stations["district"].values[d.argmin(axis=1)]


def station_pressure(lat, lng, stations: pd.DataFrame, radius_m=600.0) -> np.ndarray:
    """每個點附近的捷運人流（距離線性衰減）。"""
    d = haversine_m(np.asarray(lat)[:, None], np.asarray(lng)[:, None],
                    stations["lat"].values[None, :], stations["lng"].values[None, :])
    w = np.clip(1 - d / radius_m, 0, None)
    return (w * stations["daily_flow"].values[None, :]).sum(axis=1)


# ---------- 各資料集 ----------

def get_stations(report) -> tuple[pd.DataFrame, bool]:
    if report.get("mrt"):
        return pd.read_csv(BUILD / "real_mrt.csv"), True
    ref = pd.read_csv(REFERENCE / "mrt_stations_approx.csv")
    return ref.rename(columns={"sim_daily_flow": "daily_flow"}), False


def get_hourly(report) -> list[float]:
    if report.get("mrt"):
        return read_json(BUILD / "real_hourly.json")
    # 模擬的通勤曲線：早晚兩個尖峰，深夜幾乎沒人
    h = np.arange(24)
    curve = (
        0.15
        + 1.6 * np.exp(-((h - 8) ** 2) / 2.0)
        + 1.9 * np.exp(-((h - 18) ** 2) / 3.0)
        + 0.8 * np.exp(-((h - 13) ** 2) / 6.0)
    )
    curve[[1, 2, 3, 4]] = 0.02
    return list(np.round(curve / curve.mean(), 4))


def study_area(stations: pd.DataFrame) -> list[str]:
    cells: set[str] = set()
    for lat, lng in zip(stations["lat"], stations["lng"]):
        cells |= set(grid_disk(latlng_to_cell(lat, lng), AREA_RINGS))
    return sorted(cells)


def random_points_in_area(rng, area: list[str], n: int, sd_m=90.0):
    picks = rng.choice(len(area), n, replace=True)
    centers = np.array([cell_center(area[i]) for i in picks])
    return offset(centers[:, 0], centers[:, 1], rng.normal(0, sd_m, n), rng.normal(0, sd_m, n))


def simulate_bus(rng, stations, area) -> pd.DataFrame:
    lats, lngs = [], []
    for s in stations.itertuples():
        n = int(10 + s.daily_flow / 10_000 * 3)
        la, ln = scatter(rng, s.lat, s.lng, n, 350)
        lats.append(la); lngs.append(ln)
    la, ln = random_points_in_area(rng, area, N_SPREAD_BUS)
    lats.append(la); lngs.append(ln)
    return pd.DataFrame({"lat": np.concatenate(lats), "lng": np.concatenate(lngs)})


def simulate_youbike(rng, stations, bus) -> pd.DataFrame:
    lats, lngs = [], []
    for s in stations.itertuples():
        la, ln = scatter(rng, s.lat, s.lng, 3, 150)
        lats.append(la); lngs.append(ln)
    picks = rng.choice(len(bus), size=min(400, len(bus)), replace=False)
    la, ln = offset(bus["lat"].values[picks], bus["lng"].values[picks],
                    rng.normal(0, 40, len(picks)), rng.normal(0, 40, len(picks)))
    lats.append(la); lngs.append(ln)
    return pd.DataFrame({"lat": np.concatenate(lats), "lng": np.concatenate(lngs)})


def simulate_shops(rng, stations) -> pd.DataFrame:
    rows = []
    for s in stations.itertuples():
        n = int(25 * np.log10(s.daily_flow / 5_000 + 1))
        la, ln = scatter(rng, s.lat, s.lng, n, 300)
        rows.append(pd.DataFrame({"lat": la, "lng": ln}))
    for _, lat, lng in NIGHT_MARKETS:
        la, ln = scatter(rng, lat, lng, 80, 120)
        rows.append(pd.DataFrame({"lat": la, "lng": ln}))
    shops = pd.concat(rows, ignore_index=True)
    shops["type"] = np.where(rng.random(len(shops)) < 0.4, "drink", "food")
    return shops


def simulate_bins(rng, stations, bus) -> pd.DataFrame:
    """從公車站與捷運站附近挑 800 個位置。

    為了呈現「被撤掉的地方」，隨機挑 1/4 的捷運站和所有夜市周邊，
    把該處設桶的機率壓低 85%，模擬依違規棄置量裁撤後留下的缺口。
    """
    pool = pd.concat([bus, stations[["lat", "lng"]]], ignore_index=True)
    weight = 0.2 + station_pressure(pool["lat"], pool["lng"], stations) / stations["daily_flow"].max()

    removed = stations.sample(frac=0.25, random_state=SEED)
    removed_pts = pd.concat([
        removed[["lat", "lng"]],
        pd.DataFrame([(lat, lng) for _, lat, lng in NIGHT_MARKETS], columns=["lat", "lng"]),
    ])
    d = haversine_m(pool["lat"].values[:, None], pool["lng"].values[:, None],
                    removed_pts["lat"].values[None, :], removed_pts["lng"].values[None, :]).min(axis=1)
    weight = np.where(d < 400, weight * 0.15, weight)

    picks = rng.choice(len(pool), size=N_BINS, replace=False, p=weight / weight.sum())
    lat, lng = offset(pool["lat"].values[picks], pool["lng"].values[picks],
                      rng.normal(0, 15, N_BINS), rng.normal(0, 15, N_BINS))
    bins = pd.DataFrame({
        "id": [f"B{i:04d}" for i in range(1, N_BINS + 1)],
        "lat": lat,
        "lng": lng,
        "district": nearest_district(lat, lng, stations),
        "road": "",
    })
    return bins


def simulate_reports(rng, shops, bins, stations) -> pd.DataFrame:
    """在店家多、附近沒有桶的地方比較容易出現通報。"""
    d = haversine_m(shops["lat"].values[:, None], shops["lng"].values[:, None],
                    bins["lat"].values[None, :], bins["lng"].values[None, :]).min(axis=1)
    weight = 1 + 3 * (d > 200)
    picks = rng.choice(len(shops), size=N_REPORTS, replace=True, p=weight / weight.sum())
    lat, lng = offset(shops["lat"].values[picks], shops["lng"].values[picks],
                      rng.normal(0, 60, N_REPORTS), rng.normal(0, 60, N_REPORTS))
    days_ago = rng.integers(0, 60, N_REPORTS)
    created = pd.Timestamp("2026-10-19") - pd.to_timedelta(days_ago, unit="D")
    return pd.DataFrame({
        "id": [f"R{i:04d}" for i in range(1, N_REPORTS + 1)],
        "category": rng.choice(REPORT_CATEGORIES, N_REPORTS, p=REPORT_WEIGHTS),
        "lat": lat,
        "lng": lng,
        "created_at": created.strftime("%Y-%m-%d"),
        "district": nearest_district(lat, lng, stations),
    })


def simulate_residential(rng, bus, shops, stations) -> pd.DataFrame:
    """住宅街廓的代表點（模擬）。

    候選點是公車站（有站牌代表附近有人住、有人搭車）；
    同一格裡店家不多（不是商圈）、離大型捷運站越遠，越像住宅區，被挑中的機率越高。
    用自己的亂數產生器，不影響其他模擬資料的結果。
    """
    shop_cells = pd.Series(latlng_to_cells(shops["lat"].values, shops["lng"].values)).value_counts()
    bus_cells = latlng_to_cells(bus["lat"].values, bus["lng"].values)
    shops_here = np.array([shop_cells.get(c, 0) for c in bus_cells], dtype=float)

    pressure = station_pressure(bus["lat"], bus["lng"], stations, radius_m=800.0)
    busy = np.clip(pressure / np.quantile(pressure[pressure > 0], 0.9), 0, 1) if (pressure > 0).any() else 0

    # 住宅區通常有些巷口小店，但不是商圈：格內店家約 0～25 家最像，太多就是商圈
    weight = np.exp(-(((shops_here - 12) / 25) ** 2)) * (1 - 0.8 * busy) + 1e-6
    picks = rng.choice(len(bus), size=N_RESIDENTIAL, replace=True, p=weight / weight.sum())
    lat, lng = offset(bus["lat"].values[picks], bus["lng"].values[picks],
                      rng.normal(0, 80, N_RESIDENTIAL), rng.normal(0, 80, N_RESIDENTIAL))
    return pd.DataFrame({"lat": lat, "lng": lng})


def build_sources(report: dict) -> list[dict]:
    real = lambda key: bool(report.get(key))  # noqa: E731
    return [
        {"key": "bins", "label": "行人專用垃圾桶", "real": real("bins"),
         "note": "環保局開放資料（正式名稱「行人專用清潔箱」）" if real("bins") else "以公車站、捷運站為候選點模擬 800 組，並刻意在部分地區留下缺口"},
        {"key": "mrt", "label": "捷運站與人流", "real": real("mrt"),
         "note": "捷運公司車站資料（座標）＋各站分時進出量 2026 年 9 月（人流）" if real("mrt") else "站點座標為近似值，每日人流為模擬"},
        {"key": "bus", "label": "公車站牌", "real": real("bus"),
         "note": "交通局公運處臺北市公車站牌位置圖" if real("bus") else "依捷運人流在站點周邊撒點"},
        {"key": "youbike", "label": "YouBike 站點", "real": real("youbike"),
         "note": "交通局 YouBike2.0 臺北市公共自行車即時資訊（站點快照）" if real("youbike") else "捷運站與部分公車站旁撒點"},
        {"key": "shops", "label": "飲料店、餐飲店", "real": real("shops"),
         "note": "環保局飲料杯空杯回收點（飲料店）＋產業局含餐館業商業登記清冊（餐飲店）" if real("shops") else "依捷運人流與夜市位置撒點"},
        {"key": "residential", "label": "住宅區", "real": real("residential"),
         "note": "臺北市都市計畫土地使用分區（住宅區）" if real("residential")
         else "以公車站為候選點，店家不多、離捷運大站較遠的地方視為住宅區。真實資料：臺北市都市計畫土地使用分區圖"},
        {"key": "reports", "label": "歷史通報", "real": False, "note": "店家多、附近沒有桶的地方較常出現"},
        {"key": "fill", "label": "智慧垃圾桶填滿紀錄", "real": False, "note": "主辦說明此資料不存在，依人流與時段模擬"},
        {"key": "progress", "label": "增設進度", "real": False, "note": "從建議前 30 名隨機指定狀態"},
    ]


def main() -> None:
    ensure_dirs()
    rng = np.random.default_rng(SEED)
    report = read_json(BUILD / "load_report.json")

    stations, _ = get_stations(report)
    area = study_area(stations)
    bus = pd.read_csv(BUILD / "real_bus.csv") if report.get("bus") else simulate_bus(rng, stations, area)
    youbike = pd.read_csv(BUILD / "real_youbike.csv") if report.get("youbike") else simulate_youbike(rng, stations, bus)
    shops = pd.read_csv(BUILD / "real_shops.csv", keep_default_na=False) if report.get("shops") else simulate_shops(rng, stations)
    bins = pd.read_csv(BUILD / "real_bins.csv") if report.get("bins") else simulate_bins(rng, stations, bus)
    reports = simulate_reports(rng, shops, bins, stations)
    # 住宅區用另一個亂數產生器，加進來不會改變上面各資料的模擬結果
    residential = (pd.read_csv(BUILD / "real_residential.csv") if report.get("residential")
                   else simulate_residential(np.random.default_rng(SEED + 1), bus, shops, stations))

    stations.to_csv(BUILD / "stations.csv", index=False)
    bus.to_csv(BUILD / "bus.csv", index=False)
    youbike.to_csv(BUILD / "youbike.csv", index=False)
    shops.to_csv(BUILD / "shops.csv", index=False)
    bins.to_csv(BUILD / "bins.csv", index=False)
    reports.to_csv(BUILD / "reports.csv", index=False)
    residential.to_csv(BUILD / "residential.csv", index=False)
    write_json(BUILD / "hourly.json", get_hourly(report))
    write_json(BUILD / "area.json", area)
    write_json(BUILD / "sources.json", build_sources(report), compact=False)

    print(f"  捷運站 {len(stations)}、公車站 {len(bus)}、YouBike {len(youbike)}、店家 {len(shops)}")
    print(f"  垃圾桶 {len(bins)}、通報 {len(reports)}、住宅區 {len(residential)} 點、研究範圍 {len(area)} 格")


if __name__ == "__main__":
    main()
