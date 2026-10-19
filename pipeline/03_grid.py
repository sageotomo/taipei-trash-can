"""步驟 3：把所有點位分到 H3 六角網格，算出每格的特徵，輸出網站要用的 JSON。

每格的 6 個需求特徵：
  mrt      捷運人流：500 m 內各站每日進出人次，依距離線性衰減
  bus      公車站數：本格＋相鄰 6 格（約步行 300 m）
  youbike  YouBike 站數：同上
  food     飲料店、小吃店數：同上
  reports  市民通報數：只算本格（網頁會再加上使用者新增的通報）
  fill     現有桶的平均填滿速度：本格＋相鄰格，沒有桶就是 0

前 5 個在這裡先標準化成 0–1（*_n 欄位）；reports 要和網頁新增的通報一起算，
所以在瀏覽器裡標準化。需求、缺口都在瀏覽器裡用權重即時算（web/src/lib/score.ts）。
"""

from __future__ import annotations

import h3
import numpy as np
import pandas as pd

from common import BUILD, H3_RES, OUT, ensure_dirs, haversine_m, normalize_positive, read_json, write_json

MRT_RADIUS_M = 500
BASE_FILL = 0.02        # 最冷門的桶每小時填 2%
EXTRA_FILL = 0.12       # 最熱門的桶每小時再多 12%


def to_cell(df: pd.DataFrame) -> pd.Series:
    return pd.Series([h3.latlng_to_cell(a, b, H3_RES) for a, b in zip(df["lat"], df["lng"])], index=df.index)


def count_by_cell(cells: pd.Series) -> dict[str, int]:
    return cells.value_counts().to_dict()


def with_neighbors(area: list[str], counts: dict[str, float]) -> dict[str, float]:
    """本格＋相鄰 6 格的加總。"""
    return {c: sum(counts.get(n, 0) for n in h3.grid_disk(c, 1)) for c in area}


def bin_fill_rates(bins, stations, shops) -> np.ndarray:
    """每個桶平均每小時填滿的比例：附近捷運人流與店家越多，填得越快。"""
    d_st = haversine_m(bins["lat"].values[:, None], bins["lng"].values[:, None],
                       stations["lat"].values[None, :], stations["lng"].values[None, :])
    pressure = (np.clip(1 - d_st / MRT_RADIUS_M, 0, None) * stations["daily_flow"].values[None, :]).sum(axis=1)
    d_shop = haversine_m(bins["lat"].values[:, None], bins["lng"].values[:, None],
                         shops["lat"].values[None, :], shops["lng"].values[None, :])
    shops_near = (d_shop < 200).sum(axis=1)
    raw = pd.Series(pressure + 5_000 * shops_near)
    score = raw.rank(pct=True).values
    return BASE_FILL + EXTRA_FILL * score


def build_grid(area, stations, bins, bus, youbike, shops, reports) -> pd.DataFrame:
    centers = np.array([h3.cell_to_latlng(c) for c in area])
    grid = pd.DataFrame({"h3": area, "lat": centers[:, 0], "lng": centers[:, 1]})

    # 捷運人流（距離衰減）
    d = haversine_m(grid["lat"].values[:, None], grid["lng"].values[:, None],
                    stations["lat"].values[None, :], stations["lng"].values[None, :])
    grid["mrt"] = (np.clip(1 - d / MRT_RADIUS_M, 0, None) * stations["daily_flow"].values[None, :]).sum(axis=1)
    grid["district"] = stations["district"].values[d.argmin(axis=1)]

    for name, df in (("bus", bus), ("youbike", youbike), ("food", shops)):
        nb = with_neighbors(area, count_by_cell(to_cell(df)))
        grid[name] = grid["h3"].map(nb).fillna(0)

    grid["reports"] = grid["h3"].map(count_by_cell(reports["h3"])).fillna(0).astype(int)

    bin_counts = count_by_cell(bins["h3"])
    grid["bins"] = grid["h3"].map(bin_counts).fillna(0).astype(int)
    grid["nbins"] = grid["h3"].map(with_neighbors(area, bin_counts)).fillna(0).astype(int) - grid["bins"]

    fill_sum = bins.groupby("h3")["fill_rate"].sum().to_dict()
    sums = with_neighbors(area, fill_sum)
    n = grid["bins"] + grid["nbins"]
    grid["fill"] = np.where(n > 0, grid["h3"].map(sums).fillna(0) / n.clip(lower=1), 0.0)

    for name in ("mrt", "bus", "youbike", "food", "fill"):
        grid[f"{name}_n"] = normalize_positive(grid[name])
    return grid


def point_features(df: pd.DataFrame, props: list[str], kind: str | None = None) -> list[dict]:
    feats = []
    for row in df.itertuples(index=False):
        p = {k: getattr(row, k) for k in props}
        if kind:
            p = {"kind": kind, **p}
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(row.lng, 5), round(row.lat, 5)]},
            "properties": p,
        })
    return feats


def main() -> None:
    ensure_dirs()
    stations = pd.read_csv(BUILD / "stations.csv")
    bins = pd.read_csv(BUILD / "bins.csv", keep_default_na=False)
    bus = pd.read_csv(BUILD / "bus.csv")
    youbike = pd.read_csv(BUILD / "youbike.csv")
    shops = pd.read_csv(BUILD / "shops.csv")
    reports = pd.read_csv(BUILD / "reports.csv")
    area = read_json(BUILD / "area.json")
    sources = read_json(BUILD / "sources.json")

    bins["h3"] = to_cell(bins)
    bins["fill_rate"] = bin_fill_rates(bins, stations, shops).round(4)
    reports["h3"] = to_cell(reports)
    grid = build_grid(area, stations, bins, bus, youbike, shops, reports)

    # ---- 輸出 ----
    keep = ["h3", "district", "bins", "nbins", "mrt", "bus", "youbike", "food", "reports", "fill",
            "mrt_n", "bus_n", "youbike_n", "food_n", "fill_n"]
    rows = grid[keep].copy()
    rows["mrt"] = rows["mrt"].round(0).astype(int)
    for c in ("bus", "youbike", "food"):
        rows[c] = rows[c].astype(int)
    for c in ("fill", "mrt_n", "bus_n", "youbike_n", "food_n", "fill_n"):
        rows[c] = rows[c].round(4)
    write_json(OUT / "grid.json", rows.to_dict(orient="records"))

    sim = {s["key"]: not s["real"] for s in sources}
    bins_out = bins.assign(simulated=sim["bins"])
    write_json(OUT / "bins.geojson", {
        "type": "FeatureCollection",
        "features": point_features(bins_out, ["id", "district", "road", "h3", "fill_rate", "simulated"]),
    })

    stations_out = stations.assign(daily_flow=stations["daily_flow"].round(0).astype(int), simulated=sim["mrt"])
    pois = (
        point_features(stations_out, ["name", "daily_flow", "simulated"], "mrt")
        + point_features(bus.assign(simulated=sim["bus"]), ["simulated"], "bus")
        + point_features(youbike.assign(simulated=True), ["simulated"], "youbike")
        + point_features(shops.assign(simulated=True), ["type", "simulated"], "shop")
    )
    write_json(OUT / "pois.geojson", {"type": "FeatureCollection", "features": pois})

    reports_out = reports.assign(lat=reports["lat"].round(5), lng=reports["lng"].round(5), simulated=True)
    write_json(OUT / "reports_seed.json", reports_out.to_dict(orient="records"))
    write_json(OUT / "sources.json", sources, compact=False)

    print(f"  網格 {len(grid)} 格，有桶的格子 {(grid['bins'] > 0).sum()} 格")
    print(f"  每格平均：公車站 {grid['bus'].mean():.1f}、店家 {grid['food'].mean():.1f}")


if __name__ == "__main__":
    main()
