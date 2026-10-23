import importlib.util
from pathlib import Path

import pandas as pd

spec = importlib.util.spec_from_file_location("grid", Path(__file__).with_name("03_grid.py"))
grid = importlib.util.module_from_spec(spec)
spec.loader.exec_module(grid)


def test_point_columns_matches_point_features():
    df = pd.DataFrame({
        "lat": [25.0478012, 25.04], "lng": [121.5170049, 121.56],
        "name": ["台北車站", ""], "type": ["drink", float("nan")],
    })
    cols = grid.point_columns(df, ["name", "type"], "shop", False)
    assert cols["lat"] == [25.0478, 25.04]
    assert cols["lng"] == [121.517, 121.56]
    assert cols["props"] == {"name": ["台北車站", None], "type": ["drink", None]}

    # 轉回 GeoJSON 的屬性要和舊的 point_features 一樣
    feats = grid.point_features(df.assign(simulated=False), ["name", "type", "simulated"], "shop")
    for i, f in enumerate(feats):
        p = {"kind": "shop", "simulated": False}
        for k, arr in cols["props"].items():
            if arr[i] is not None:
                p[k] = arr[i]
        assert p == f["properties"]
        assert [cols["lng"][i], cols["lat"][i]] == f["geometry"]["coordinates"]
