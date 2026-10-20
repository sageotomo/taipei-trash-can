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
