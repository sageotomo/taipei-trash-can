import importlib

import pandas as pd
import pytest

pytest.importorskip("pyproj")
load = importlib.import_module("01_load")   # 檔名以數字開頭，不能直接 import
sim = importlib.import_module("02_simulate")
from hexgrid import latlng_to_cell  # noqa: E402


def test_load_addresses_converts_twd97(tmp_path, monkeypatch):
    # 欄位照民政局「臺北市門牌位置數值資料」，Big5 編碼；座標是 TWD97 二度分帶
    df = pd.DataFrame({
        "省市縣市代碼": ["63000", "63000", "63000"],
        "鄉鎮市區代碼": ["63000020", "63000020", "63000020"],
        "村里": ["西村里", "西村里", "西村里"],
        "鄰": ["001", "001", "001"],
        "街路段": ["市府路", "市府路", "外縣市路"],
        "地區": ["", "", ""], "巷": ["", "", ""], "弄": ["", "", ""],
        "號": ["1號", "3號", "1號"],
        "橫座標": [306954, 306980, 100],        # 最後一筆座標不合理，要被排除
        "縱座標": [2770050, 2770060, 100],
    })
    df.to_csv(tmp_path / "addresses.csv", index=False, encoding="cp950")
    monkeypatch.setattr(load, "RAW", tmp_path)

    out = load.load_addresses()
    assert len(out) == 2
    assert out["lat"].iloc[0] == pytest.approx(25.0375, abs=1e-4)
    assert out["lng"].iloc[0] == pytest.approx(121.5644, abs=1e-4)


def test_homes_subtracts_shops_in_same_cell():
    a = (25.0478, 121.517)   # 台北車站附近
    b = (25.0375, 121.5644)  # 市政府附近，另一格
    addresses = pd.DataFrame({"lat": [a[0]] * 5 + [b[0]] * 2, "lng": [a[1]] * 5 + [b[1]] * 2})
    shops = pd.DataFrame({"lat": [a[0]] * 2 + [b[0]] * 3, "lng": [a[1]] * 2 + [b[1]] * 3})
    homes = sim.homes_from_addresses(addresses, shops)
    by_cell = {latlng_to_cell(r.lat, r.lng): r.homes for r in homes.itertuples()}
    assert by_cell == {latlng_to_cell(*a): 3}   # 5 − 2；另一格 2 − 3 < 0 不輸出
