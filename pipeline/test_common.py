import numpy as np

from common import haversine_m, offset


def test_offset_moves_about_the_requested_distance():
    lat, lng = 25.0478, 121.5170  # 台北車站
    new_lat, new_lng = offset(lat, lng, 300, 400)
    d = haversine_m(lat, lng, new_lat, new_lng)
    assert abs(float(d) - 500) < 2  # 3-4-5 直角三角形


def test_haversine_known_distance():
    # 台北車站 → 市政府站 約 4.9 公里
    d = haversine_m(25.0478, 121.5170, 25.0411, 121.5651)
    assert 4_700 < float(np.asarray(d)) < 5_100
