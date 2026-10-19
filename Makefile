# 一鍵產生網站要用的資料：make all
# 只需要在換了原始資料或改了計算邏輯時重跑。

PY ?= python3
P := pipeline

.PHONY: all data test clean

all: data

data:
	cd $(P) && $(PY) 01_load.py
	cd $(P) && $(PY) 02_simulate.py

test:
	cd $(P) && $(PY) -m pytest -q
	cd web && npm test

clean:
	rm -rf $(P)/build
