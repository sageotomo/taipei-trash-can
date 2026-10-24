// 底圖：優先用內政部國土測繪中心的「臺灣通用電子地圖(灰階)」（圖層 EMAP01，中文標註、免 API key），
// 載入失敗太多次就自動換成 OpenStreetMap。
// 用官方灰階圖磚而不是 CSS 濾鏡，讓疊上去的圖示和六角形格子比較清楚；網站介面是深色，地圖維持淺色。
// （CARTO 深色底圖要 API key，沒 key 會回傳浮水印圖而不是錯誤，所以不用。）

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

const SOURCES = [
  {
    name: "國土測繪中心",
    url: "https://wmts.nlsc.gov.tw/wmts/EMAP01/default/GoogleMapsCompatible/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noreferrer">內政部國土測繪中心</a>',
  },
  {
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  },
];

const MAX_ERRORS = 6;

export function BaseMap() {
  const map = useMap();

  useEffect(() => {
    let index = 0;
    let errors = 0;
    let layer: L.TileLayer | null = null;

    const use = (i: number) => {
      layer?.remove();
      index = i;
      errors = 0;
      const source = SOURCES[i];
      layer = L.tileLayer(source.url, { attribution: source.attribution, maxZoom: 19 });
      layer.on("tileerror", () => {
        errors += 1;
        if (errors >= MAX_ERRORS && index + 1 < SOURCES.length) use(index + 1);
      });
      layer.addTo(map);
    };

    use(0);
    return () => {
      layer?.remove();
    };
  }, [map]);

  return null;
}
