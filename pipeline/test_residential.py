import importlib

import pandas as pd

sim = importlib.import_module("02_simulate")  # 檔名以數字開頭，不能直接 import


def test_non_residential_stops_are_excluded():
    names = pd.Series(["長安國小(吉林)", "馬偕醫院", "大同分局", "新生公園", "第二殯儀館", "福美站", None])
    assert sim.non_residential_mask(names).tolist() == [True, True, True, True, True, False, False]


def test_residential_names_are_kept_even_with_other_words():
    # 「花園」「榮總」會命中排除清單，但「社區」「新村」代表就是住宅區
    names = pd.Series(["南港花園社區", "榮光新村(榮總)"])
    assert sim.non_residential_mask(names).tolist() == [False, False]


def test_residential_point_is_at_addresses_not_cell_center():
    """大直明水路：hex 中心在基隆河上，門牌都在北緣，點要畫在門牌那裡，而且還在同一格"""
    from hexgrid import cell_center, latlng_to_cells
    addrs = pd.DataFrame({"lat": [25.077294, 25.077291], "lng": [121.545710, 121.546701], "n": [144, 57]})
    empty = pd.DataFrame({"lat": [], "lng": [], "type": [], "daily_flow": []})
    out = sim.homes_from_addresses(addrs, empty, empty, pd.DataFrame({"lat": [], "lng": []}))
    assert len(out) == 1 and out["homes"][0] == 201
    cell = latlng_to_cells(addrs["lat"].values[:1], addrs["lng"].values[:1])[0]
    assert latlng_to_cells(out["lat"].values, out["lng"].values)[0] == cell
    assert abs(out["lat"][0] - 25.0773) < 1e-4          # 在明水路，不在河上
    assert abs(cell_center(cell)[0] - 25.0763) < 1e-4   # 原本的 hex 中心
