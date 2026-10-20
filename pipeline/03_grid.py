"""步驟 3：輸出網站要用的點位資料。

缺桶指數完全在瀏覽器裡算（web/src/lib/indicators.ts）：每一格只看格內的點，
使用者可以自己加減指標、調整權重，所以這裡只負責把點位整理好：
  pois.geojson        捷運站（含每日人流、行政區）、公車站、YouBike、店家
  bins.geojson        垃圾桶（含格子編號、模擬的填滿速度）
  reports_seed.json   歷史通報（模擬）
  residential.geojson 住宅區：有門牌資料時每格一點（住家門牌數），沒有時為模擬點（每點 1）
  sources.json        每份資料是真實還是模擬
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from common import BUILD, OUT, ensure_dirs, haversine_m, read_json, write_json
from hexgrid import latlng_to_cells

MRT_RADIUS_M = 500
BASE_FILL = 0.02        # 最冷門的桶每小時填 2%
EXTRA_FILL = 0.12       # 最熱門的桶每小時再多 12%


def to_cell(df: pd.DataFrame) -> pd.Series:
    return pd.Series(latlng_to_cells(df["lat"].values, df["lng"].values), index=df.index)


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


def with_name(df: pd.DataFrame) -> pd.DataFrame:
    """模擬資料沒有名稱欄位時補空字串"""
    return df if "name" in df.columns else df.assign(name="")


def point_features(df: pd.DataFrame, props: list[str], kind: str | None = None) -> list[dict]:
    feats = []
    for row in df.itertuples(index=False):
        p = {}
        for k in props:
            v = getattr(row, k)
            if isinstance(v, float) and math.isnan(v) or v == "":
                continue  # 沒有值就省略，讓檔案小一點
            p[k] = v.item() if hasattr(v, "item") else v
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
    residential = pd.read_csv(BUILD / "residential.csv")
    sources = read_json(BUILD / "sources.json")

    # 先四捨五入到輸出用的精度（約 1 m），格子編號才會和網頁用輸出座標算出來的一致
    for df in (bins, reports):
        df["lat"], df["lng"] = df["lat"].round(5), df["lng"].round(5)
    bins["cell"] = to_cell(bins)
    bins["fill_rate"] = bin_fill_rates(bins, stations, shops).round(4)
    reports["cell"] = to_cell(reports)

    # 舊版的網格檔，現在改由瀏覽器計算
    for old in ("grid.json", "progress.json"):
        (OUT / old).unlink(missing_ok=True)

    sim = {s["key"]: not s["real"] for s in sources}
    bins_out = bins.assign(simulated=sim["bins"])
    write_json(OUT / "bins.geojson", {
        "type": "FeatureCollection",
        "features": point_features(bins_out, ["id", "district", "road", "cell", "fill_rate", "simulated"]),
    })

    stations_out = stations.assign(daily_flow=stations["daily_flow"].round(0).astype(int), simulated=sim["mrt"])
    pois = (
        point_features(stations_out, ["name", "daily_flow", "district", "simulated"], "mrt")
        + point_features(with_name(bus).assign(simulated=sim["bus"]), ["name", "simulated"], "bus")
        + point_features(with_name(youbike).assign(simulated=sim["youbike"]), ["name", "simulated"], "youbike")
        + point_features(with_name(shops).assign(simulated=sim["shops"]), ["name", "type", "simulated"], "shop")
    )
    write_json(OUT / "pois.geojson", {"type": "FeatureCollection", "features": pois})

    write_json(OUT / "residential.geojson", {
        "type": "FeatureCollection",
        "features": point_features(residential.assign(simulated=sim["residential"]), ["homes", "simulated"]),
    })

    reports_out = reports.assign(lat=reports["lat"].round(5), lng=reports["lng"].round(5), simulated=True)
    write_json(OUT / "reports_seed.json", reports_out.to_dict(orient="records"))
    write_json(OUT / "sources.json", sources, compact=False)

    print(f"  點位 {len(pois)} 個、垃圾桶 {len(bins)} 個（{bins['cell'].nunique()} 格）、通報 {len(reports)} 件")


if __name__ == "__main__":
    main()
