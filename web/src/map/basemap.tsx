// 底圖：深色系，優先用 CARTO 的深色底圖（免 API key），
// 載入失敗太多次就依序換成國土測繪中心「臺灣通用電子地圖」、OpenStreetMap。
// 後兩者是淺色地圖，用 CSS 濾鏡（.basemap-invert）反相成同一套深色。

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

const SOURCES = [
  {
    name: "CARTO 深色",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
    className: "basemap",
  },
  {
    name: "國土測繪中心",
    url: "https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noreferrer">內政部國土測繪中心</a>',
    className: "basemap basemap-invert",
  },
  {
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    className: "basemap basemap-invert",
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
      layer = L.tileLayer(source.url, { attribution: source.attribution, maxZoom: 19, className: source.className, subdomains: "abcd" });
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
