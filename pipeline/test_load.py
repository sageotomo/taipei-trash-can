import importlib.util
from pathlib import Path

import pandas as pd

spec = importlib.util.spec_from_file_location("load", Path(__file__).with_name("01_load.py"))
load = importlib.util.module_from_spec(spec)
spec.loader.exec_module(load)


def test_clean_coord_fixes_stray_chars_and_extra_dots():
    s = pd.Series(["121.5172055", "?121.595369", "121.513.652", " 25.0375 ", "abc"])
    out = load.clean_coord(s)
    assert out.tolist()[:4] == [121.5172055, 121.595369, 121.513652, 25.0375]
    assert pd.isna(out.iloc[4])
