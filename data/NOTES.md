# 原始資料筆記

真實資料放在 `data/raw/`，`make all` 會自動使用；沒放的資料集會用模擬資料補上，網頁上會標示「模擬」。
以下資料於 **2026-10-19** 從臺北市資料大平臺下載一次，之後不會自動更新。

| 檔名 | 資料集 | 提供機關 | 筆數 | 說明 |
| --- | --- | --- | --- | --- |
| `mrt_stations.csv` | [臺北捷運車站資料服務](https://data.taipei/dataset/detail?id=1eefa68d-7c8d-491b-8e75-66a161947426) | 捷運公司 | 74 站 | 只留地址在臺北市的車站；轉乘站合併成一筆 |
| `mrt_daily.csv`、`mrt_hourly.csv` | [臺北捷運各站分時進出量統計](https://data.taipei/dataset/detail?id=63f31c7e-7fc3-418b-bd82-b95158755b4d) | 捷運公司 | 2026 年 9 月 | 原始 OD 月檔約 300 MB，在瀏覽器裡串流彙總成各站每日進出、全市每小時人次 |
| `bus_stops.csv` | [臺北市公車站牌位置圖](https://data.taipei/dataset/detail?id=48aa5bca-2a4f-4fb7-a658-43cba51d5d56) | 交通局公運處 | 3,407 站位 | 原始為 SHP；說明寫 TWD97，但實際座標已是經緯度 |
| `youbike.csv` | [YouBike2.0臺北市公共自行車即時資訊](https://data.taipei/dataset/detail?id=c6bc8aed-557d-41d5-bfb1-8da24f78f2fb) | 交通局 | 1,792 站 | 2026-10-19 的站點快照，只留營運中的站 |
| `drink_shops.csv` | [臺北市飲料杯空杯回收點](https://data.taipei/dataset/detail?id=3ce36c6a-9c62-4082-8997-5df87fe37106) | 環保局 | 1,392 家 | 參加空杯回收的飲料店門市，未參加的飲料店不在名單內 |
| `food_businesses.csv` | [設址臺北市所營事業含餐館業清冊](https://data.taipei/dataset/detail?id=178abc4e-fe32-4fc9-af3a-7baf1c15082c) | 產業局 | 20,285 家 | 營業項目含餐館業的商業登記，包含小吃店，也包含一般餐廳 |
| `vendor_markets.csv` | [臺北市臨時攤販集中場](https://data.taipei/dataset/detail?id=c013d9ec-a550-46bd-ac60-45f085930706) | 產業局 | 47 處 | 下載備用，目前未使用 |

## 仍是模擬的資料

- 行人專用清潔箱位置（[data.gov.tw/dataset/121355](https://data.gov.tw/dataset/121355)，下載後存成 `bins.csv` 即可換成真實資料）
- 歷史市民通報、智慧垃圾桶填滿紀錄、增設進度

## 已知限制

- 飲料店只有參加空杯回收的門市，實際家數更多。
- 餐飲店是商業登記資料，未辦登記的攤販不在內；已歇業但未註銷的也可能還在。
- 捷運人流只有車站層級，沒有各出口的人流。
