# 原始資料筆記

把真實資料下載後放進 `data/raw/`，用下面的檔名，`make all` 就會自動改用真實資料。
沒放的資料集會用模擬資料補上，網頁上會標示「模擬」。

| 檔名 | 資料集 | 來源 | 需要的欄位 |
| --- | --- | --- | --- |
| `bins.csv` | 臺北市行人專用清潔箱 | [data.gov.tw/dataset/121355](https://data.gov.tw/dataset/121355) | 經度、緯度（可選：行政區、路名） |
| `mrt_od.csv` | 臺北捷運每日分時各站 OD 流量（挑一個月） | [data.taipei 索引檔](https://data.taipei/dataset/detail?id=63f31c7e-7fc3-418b-bd82-b95158755b4d) | 日期、時段、進站、出站、人次 |
| `mrt_stations.csv` | 捷運站座標（自己整理或另找資料集） | — | name、lat、lng、district |
| `bus_stops.shp`（或 `.geojson`、`.csv`） | 臺北市公車站牌位置 | [data.taipei](https://data.taipei/dataset/detail?id=48aa5bca-2a4f-4fb7-a658-43cba51d5d56) | SHP 需要 `pip install geopandas`；CSV 需要 lat、lng |

## 已知事項

- 捷運索引檔列出每月的下載網址，最新為 2026/09。月檔很大，只需要一個月。
- 編碼：程式會依序嘗試 UTF-8 和 Big5。
- 公車站牌 SHP 的座標系若不是 WGS84，程式會自動轉換。

## 待確認

- [ ] 捷運月檔的實際欄位名稱
- [ ] 捷運站名能不能和 OD 檔的站名對上
- [ ] 陳情系統類別資料有沒有地點欄位
