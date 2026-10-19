import numpy as np
import pandas as pd

from common import haversine_m, normalize_positive, offset


def test_normalize_keeps_zero_and_ranks_positive_values():
    s = pd.Series([0, 0, 0, 5, 10, 20])
    out = normalize_positive(s)
    assert list(out[:3]) == [0, 0, 0]
    assert list(out[3:].round(3)) == [0.333, 0.667, 1.0]


def test_normalize_all_zero():
    out = normalize_positive(pd.Series([0, 0]))
    assert list(out) == [0, 0]


def test_offset_moves_about_the_requested_distance():
    lat, lng = 25.0478, 121.5170  # 台北車站
    new_lat, new_lng = offset(lat, lng, 300, 400)
    d = haversine_m(lat, lng, new_lat, new_lng)
    assert abs(float(d) - 500) < 2  # 3-4-5 直角三角形


def test_haversine_known_distance():
    # 台北車站 → 市政府站 約 4.9 公里
    d = haversine_m(25.0478, 121.5170, 25.0411, 121.5651)
    assert 4_700 < float(np.asarray(d)) < 5_100
