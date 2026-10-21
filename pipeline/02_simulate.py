"""步驟 2：補齊模擬資料。

原則：模擬資料都從（真實或近似的）捷運人流推出來，人流越大的地方，
公車站、店家越多，所以熱點會落在合理的位置。固定 seed，每次結果都一樣。

輸出到 pipeline/build/：
  stations.csv  bins.csv  bus.csv  youbike.csv  shops.csv  reports.csv  residential.csv
  hourly.json   area.json（研究範圍的格子）  sources.json
"""

from __future__ import annotations

import re

import numpy as np
import pandas as pd

from common import BUILD, RAW, REFERENCE, SEED, ensure_dirs, haversine_m, offset, read_json, write_json
from hexgrid import cell_center, grid_disk, latlng_to_cell, latlng_to_cells

N_BINS = 800          # 主辦說明：目前約 800 組
N_SPREAD_BUS = 1200   # 研究範圍內平均撒的公車站
N_REPORTS = 260
N_RESIDENTIAL = 700   # 住宅街廓的代表點

# 站名看得出附近明顯不是住宅的公車站，不當住宅區的候選點
NON_RESIDENTIAL = {
    "學校": ["國小", "國中", "高中", "高職", "中學", "大學", "學院", "科大", "實小", "附中", "商工", "工商",
             "家商", "高工", "女中", "小學", "學校", "師大", "台大", "臺大", "政大"],
    "公家單位": ["市政府", "區公所", "公所", "派出所", "分局", "警察局", "消防", "戶政", "地政", "國稅", "稅捐",
                 "法院", "地檢", "監理", "衛生所", "健康服務中心", "立法院", "總統府", "行政院", "市議會", "營區",
                 "監獄", "看守所"],
    "公園綠地": ["公園", "植物園", "動物園", "河濱", "運動中心", "體育館", "運動場", "綠地", "森林", "步道",
                 "登山口", "花園", "農場", "風景區"],
    "醫院": ["醫院", "榮總", "醫學中心", "療養院"],
    "其他": ["殯儀館", "公墓", "墓園", "機場", "轉運站"],
}
# 站名有這些字代表就是住宅區（例如「南港花園社區」「榮光新村(榮總)」），即使也含上面的字仍然保留
RESIDENTIAL_HINTS = ["社區", "新村", "新城", "國宅", "山莊", "眷村", "大廈", "華廈"]
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


def non_residential_mask(names: pd.Series) -> np.ndarray:
    """站名看得出是學校、公家單位、公園、醫院等明顯不是住宅的地方 → True"""
    names = names.fillna("").astype(str)
    words = [w for ws in NON_RESIDENTIAL.values() for w in ws]
    hit = names.apply(lambda n: any(w in n for w in words))
    home = names.apply(lambda n: any(w in n for w in RESIDENTIAL_HINTS))
    return (hit & ~home).values


def simulate_residential(rng, bus, shops, stations) -> pd.DataFrame:
    """住宅街廓的代表點（模擬）。

    候選點是公車站（有站牌代表附近有人住、有人搭車），
    但站名看得出是學校、公家單位、公園、醫院等的站不算（見 NON_RESIDENTIAL）；
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
    if "name" in bus.columns:
        weight = np.where(non_residential_mask(bus["name"]), 0.0, weight)
    picks = rng.choice(len(bus), size=N_RESIDENTIAL, replace=True, p=weight / weight.sum())
    lat, lng = offset(bus["lat"].values[picks], bus["lng"].values[picks],
                      rng.normal(0, 80, N_RESIDENTIAL), rng.normal(0, 80, N_RESIDENTIAL))
    return pd.DataFrame({"lat": lat, "lng": lng, "homes": 1})


MIN_RESIDENTIAL = 100   # 住宅值低於這個的格子不算住宅區（地圖也不標）
MARKET_RADIUS_M = 300   # 夜市、攤販集中場周邊算商圈


def parse_dms(v) -> float:
    """「121°29'29.7」→ 121.4916"""
    d, m, sec = (float(x) for x in re.findall(r"[\d.]+", str(v))[:3])
    return d + m / 60 + sec / 3600


def markets(report) -> pd.DataFrame:
    """夜市與臨時攤販集中場：攤販沒有商業登記，店家資料看不到，要另外標成商圈"""
    rows = [(lat, lng) for _, lat, lng in NIGHT_MARKETS]
    path = RAW / "vendor_markets.csv"
    if path.exists():
        vm = pd.read_csv(path)
        rows += [(parse_dms(la), parse_dms(ln)) for la, ln in zip(vm["GTag_latitude"], vm["GTag_longitude"])]
    return pd.DataFrame(rows, columns=["lat", "lng"])


def homes_from_addresses(addresses: pd.DataFrame, shops: pd.DataFrame, stations: pd.DataFrame,
                         market_pts: pd.DataFrame) -> pd.DataFrame:
    """真實門牌 → 每格一筆「住宅值」：住很多人，而且不是商圈。

    台北住商混合，商圈裡也住很多人，所以只看門牌數會到處都是住宅區。這裡：
      住家門牌 ＝ 格內門牌數（每點代表 n 個）－ 格內店家數
      商圈程度 ＝ max(飲料店 ÷ P90, 餐飲店 ÷ P90, 捷運人流 ÷ P90, 夜市／攤販集中場 300m 內 → 1)，0～1
      住宅值   ＝ 住家門牌 ×（1 − 商圈程度），低於 MIN_RESIDENTIAL 的格子不輸出
    P90 是「有資料的格子」中第 90 百分位，和網站上指標的自動上限同一個做法。
    """
    def per_cell(df, weights=None):
        w = np.ones(len(df)) if weights is None else np.asarray(weights)
        return pd.Series(w, index=latlng_to_cells(df["lat"].values, df["lng"].values)).groupby(level=0).sum()

    n = addresses["n"] if "n" in addresses.columns else None
    addr = per_cell(addresses, n)
    cells = addr.index
    drinks = per_cell(shops[shops["type"] == "drink"]).reindex(cells, fill_value=0)
    food = per_cell(shops[shops["type"] != "drink"]).reindex(cells, fill_value=0)
    flow = per_cell(stations, stations["daily_flow"]).reindex(cells, fill_value=0)
    homes = (addr - (drinks + food)).clip(lower=0)

    def ratio(v):
        pos = v[v > 0]
        return np.clip(v / np.quantile(pos, 0.9), 0, 1) if len(pos) else v * 0

    centers = np.array([cell_center(c) for c in cells]) if len(cells) else np.empty((0, 2))
    near_market = np.zeros(len(cells), dtype=bool)
    if len(cells) and len(market_pts):
        d = haversine_m(centers[:, :1], centers[:, 1:], market_pts["lat"].values[None, :], market_pts["lng"].values[None, :])
        near_market = d.min(axis=1) < MARKET_RADIUS_M
    commercial = np.maximum.reduce([ratio(drinks).values, ratio(food).values, ratio(flow).values, near_market.astype(float)])

    value = np.round(homes.values * (1 - commercial)).astype(int)
    keep = value >= MIN_RESIDENTIAL
    return pd.DataFrame({"lat": centers[keep, 0], "lng": centers[keep, 1], "homes": value[keep]})


# 有真實資料時：說明 + 開放資料連結（網頁上滑鼠移到「真實資料」旁的 ! 會顯示）
REAL_SOURCES = {
    "bins": ("環保局「行人專用清潔箱總表」，681 處。檔案裡沒有北投區、南港區只有 4 處，總數也少於環保局 2026 年 8 月報告的 806 組，可能不是最新版。",
        [{"label": "行人專用清潔箱總表（政府資料開放平臺）", "url": "https://data.gov.tw/dataset/121355"}]),
    "mrt": ("捷運公司車站資料（74 站座標）＋各站分時進出量 2026 年 9 月，換算成每站每天的進出人次。",
        [{"label": "臺北捷運車站資料服務", "url": "https://data.taipei/dataset/detail?id=1eefa68d-7c8d-491b-8e75-66a161947426"}, {"label": "臺北捷運各站分時進出量統計", "url": "https://data.taipei/dataset/detail?id=63f31c7e-7fc3-418b-bd82-b95158755b4d"}]),
    "bus": ("交通局公運處臺北市公車站牌位置圖，3,407 個站位。",
        [{"label": "臺北市公車站牌位置圖", "url": "https://data.taipei/dataset/detail?id=48aa5bca-2a4f-4fb7-a658-43cba51d5d56"}]),
    "youbike": ("交通局 YouBike2.0 即時資訊，2026-10-19 的站點快照，只留營運中的 1,792 站。",
        [{"label": "YouBike2.0臺北市公共自行車即時資訊", "url": "https://data.taipei/dataset/detail?id=c6bc8aed-557d-41d5-bfb1-8da24f78f2fb"}]),
    "shops": ("飲料店：環保局飲料杯空杯回收點，1,392 家門市（沒參加空杯回收的飲料店不在內）。餐飲店：產業局含餐館業的商業登記清冊，20,285 家。",
        [{"label": "臺北市飲料杯空杯回收點", "url": "https://data.taipei/dataset/detail?id=3ce36c6a-9c62-4082-8997-5df87fe37106"}, {"label": "設址臺北市所營事業含餐館業清冊", "url": "https://data.taipei/dataset/detail?id=178abc4e-fe32-4fc9-af3a-7baf1c15082c"}]),
    "residential": ("民政局臺北市門牌位置數值資料（2026-10-02 版）。住宅值 ＝ 住家門牌（門牌扣掉店家）×（1 − 商圈程度），商圈程度看飲料店、餐飲店、捷運人流與夜市／攤販集中場。",
        [{"label": "臺北市門牌位置數值資料", "url": "https://data.taipei/dataset/detail?id=b7c8e724-1e98-45ee-a0bd-f3840623ed97"}, {"label": "臺北市臨時攤販集中場", "url": "https://data.taipei/dataset/detail?id=c013d9ec-a550-46bd-ac60-45f085930706"}]),
}
# 沒有真實資料時的模擬方法
SIMULATED_NOTES = {
    "bins": "以公車站、捷運站為候選點模擬 800 組，並刻意在部分地區留下缺口",
    "mrt": "站點座標為近似值，每日人流為模擬",
    "bus": "依捷運人流在站點周邊撒點",
    "youbike": "捷運站與部分公車站旁撒點",
    "shops": "依捷運人流與夜市位置撒點",
    "residential": "以公車站為候選點（排除站名是學校、公家單位、公園、醫院等的站），店家不多、離捷運大站較遠的地方視為住宅區。真實資料：民政局臺北市門牌位置數值資料",
}
# 一定是模擬的資料：模擬方法
ALWAYS_SIMULATED = [
    {"key": "reports", "label": "歷史通報", "real": False, "note": "模擬 260 件，三類：亂丟垃圾 50%、垃圾桶滿溢 25%、家戶垃圾棄置 25%。從店家位置抽樣，200 公尺內沒有垃圾桶的店家被抽中的機率是 4 倍，再隨機偏移約 60 公尺，日期分布在最近 60 天。使用者在網頁上新增的通報也會算進來。"},
    {"key": "fill", "label": "智慧垃圾桶填滿紀錄", "real": False, "note": "主辦說明這份資料不存在。假設每個垃圾桶都有填滿感測器，模擬一週每小時的填滿度：每小時增加量 ＝ 這個桶的填滿速度 × 時段係數（用捷運真實的分時人流）× 週末係數 1.15 ＋ 隨機雜訊。附近捷運人流與店家越多，填滿速度越快。"},
    {"key": "progress", "label": "增設進度", "real": False, "note": "假設市府採納了預設指標下的建議增設前 30 名，用固定亂數種子隨機指定狀態：已設置 30%、施工中 20%、規劃中 27%、未處理 23%。實際上應由環保局每週更新。"},
]


def build_sources(report: dict) -> list[dict]:
    out = []
    for key, label in {"bins": "行人專用垃圾桶", "mrt": "捷運站與人流", "bus": "公車站牌", "youbike": "YouBike 站點", "shops": "飲料店、餐飲店", "residential": "住宅區"}.items():
        if report.get(key):
            note, links = REAL_SOURCES[key]
            out.append({"key": key, "label": label, "real": True, "note": note, "links": links})
        else:
            out.append({"key": key, "label": label, "real": False, "note": SIMULATED_NOTES[key]})
    return out + ALWAYS_SIMULATED


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
    residential = (homes_from_addresses(pd.read_csv(BUILD / "real_addresses.csv"), shops, stations, markets(report)) if report.get("residential")
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
    print(f"  垃圾桶 {len(bins)}、通報 {len(reports)}、住宅區 {len(residential)} 點（住家門牌 {int(residential['homes'].sum())}）、研究範圍 {len(area)} 格")


if __name__ == "__main__":
    main()
