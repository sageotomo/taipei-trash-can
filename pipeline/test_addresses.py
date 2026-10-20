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
    assert len(out) == 2 and out["n"].tolist() == [1, 1]
    assert out["lat"].iloc[0] == pytest.approx(25.0375, abs=1e-4)
    assert out["lng"].iloc[0] == pytest.approx(121.5644, abs=1e-4)


def test_load_aggregated_addresses(tmp_path, monkeypatch):
    # 彙總檔：TWD97 ÷ 100 的方格與門牌數，方格中心當點位
    pd.DataFrame({"bx": [3069], "by": [27700], "n": [42]}).to_csv(tmp_path / "addresses_100m.csv", index=False)
    monkeypatch.setattr(load, "RAW", tmp_path)
    out = load.load_addresses()
    assert out["n"].tolist() == [42]
    assert out["lat"].iloc[0] == pytest.approx(25.0375, abs=1e-3)


A = (25.0590, 121.5590)   # 住宅格
B = (25.0421, 121.5081)   # 商圈格（另一格）
NO_STATIONS = pd.DataFrame({"lat": [], "lng": [], "daily_flow": []})
NO_MARKETS = pd.DataFrame({"lat": [], "lng": []})


def pts(p, k, **extra):
    return pd.DataFrame({"lat": [p[0]] * k, "lng": [p[1]] * k, **{key: [v] * k for key, v in extra.items()}})


def by_cell(df):
    return {latlng_to_cell(r.lat, r.lng): r.homes for r in df.itertuples()}


def test_residential_keeps_homes_and_drops_commercial_cells():
    addresses = pd.concat([pts(A, 1, n=300), pts(B, 1, n=300)])
    shops = pd.concat([pts(A, 2, type="food"), pts(B, 10, type="drink")])
    # B 格有 10 家飲料店，就是飲料店的 P90 → 商圈程度 1 → 不算住宅區
    out = by_cell(sim.homes_from_addresses(addresses, shops, NO_STATIONS, NO_MARKETS))
    assert latlng_to_cell(*B) not in out


def test_residential_value_discounted_by_commercial_level():
    # 三格都住 400 戶；C 格有 1 家飲料店、D 格有 4 家（P90）→ C 打折、D 歸零、A 沒店不打折
    C, D = (25.0735, 121.5900), (24.9990, 121.5680)
    addresses = pd.concat([pts(A, 1, n=400), pts(C, 1, n=400), pts(D, 1, n=400)])
    shops = pd.concat([pts(C, 1, type="drink"), pts(D, 4, type="drink")])
    out = by_cell(sim.homes_from_addresses(addresses, shops, NO_STATIONS, NO_MARKETS))
    assert out[latlng_to_cell(*A)] == 400
    assert 100 <= out[latlng_to_cell(*C)] < 400
    assert latlng_to_cell(*D) not in out


def test_night_markets_are_not_residential():
    addresses = pts(A, 1, n=500)
    market = pd.DataFrame({"lat": [A[0]], "lng": [A[1]]})
    assert sim.homes_from_addresses(addresses, pts(B, 0, type="food"), NO_STATIONS, market).empty


def test_small_values_are_dropped():
    out = sim.homes_from_addresses(pts(A, 1, n=sim.MIN_RESIDENTIAL - 1), pts(B, 0, type="food"), NO_STATIONS, NO_MARKETS)
    assert out.empty


def test_parse_dms():
    assert sim.parse_dms("121°29'29.7") == pytest.approx(121.49158, abs=1e-5)


def test_load_bins_strips_stray_characters(tmp_path, monkeypatch):
    # 環保局原始檔：Big5、欄位「地址」，有一筆經度前面多了「?」
    pd.DataFrame({
        "行政區": ["中正區", "文山區"], "地址": ["中山南路20號", "指南路3段40巷"],
        "經度": ["121.5169444", "?121.595369"], "緯度": [25.0375, 24.968972], "備註": ["", ""],
    }).to_csv(tmp_path / "bins.csv", index=False, encoding="cp950")
    monkeypatch.setattr(load, "RAW", tmp_path)
    out = load.load_bins()
    assert out["lng"].tolist() == pytest.approx([121.5169444, 121.595369])
    assert out["road"].tolist() == ["中山南路20號", "指南路3段40巷"]
