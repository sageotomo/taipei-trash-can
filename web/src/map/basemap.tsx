// 底圖：優先用內政部國土測繪中心的「臺灣通用電子地圖」（中文標註、免 API key），
// 載入失敗太多次就自動換成 OpenStreetMap。
// 配色：用 SVG 濾鏡（#basemap-tone）重新上色——河道、水域換成淡藍灰，綠地換成淡綠，
// 其他全部轉灰階，讓疊上去的圖示和六角形格子比較清楚。
// 只有夠亮的藍色、綠色才會上色，所以深色文字（包含藍色的河名）維持原本的深淺，不會被蓋掉。
// 濾鏡只加在底圖這一層，不影響上面的圖示和格子。
// （CARTO 深色底圖要 API key，沒 key 會回傳浮水印圖而不是錯誤，所以不用。）

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

const SOURCES = [
  {
    name: "國土測繪中心",
    url: "https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noreferrer">內政部國土測繪中心</a>',
  },
  {
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  },
];

const MAX_ERRORS = 6;

/** 淡色系：水域、綠地（0–255） */
const WATER = [211, 227, 236];
const GREEN = [220, 231, 212];

const FILTER_ID = "basemap-tone";
const c = (rgb: number[]) => rgb.map((v) => (v / 255).toFixed(3));

// 每一層的意思：
// gray  ：整張轉灰階（帶一點點冷色，和網站的深藍灰介面搭）
// lum   ：亮度遮罩，只有亮的地方（底色區塊）才會被上色，文字和線條不會
// water ：藍色比紅色多很多的地方 → 淡藍灰
// green ：綠色同時比紅、藍多的地方 → 淡綠（黃色道路綠比紅少，不會被算進來）
function filterMarkup() {
  const [wr, wg, wb] = c(WATER);
  const [gr, gg, gb] = c(GREEN);
  return `
<filter id="${FILTER_ID}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
  <feColorMatrix in="SourceGraphic" type="matrix" result="gray" values="
    0.209 0.705 0.071 0 0  0.211 0.711 0.072 0 0  0.213 0.715 0.072 0 0  0 0 0 1 0"/>
  <feColorMatrix in="SourceGraphic" type="matrix" result="lum" values="
    0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.70 5.72 0.58 0 -5.4"/>
  <feColorMatrix in="SourceGraphic" type="matrix" result="w0" values="
    0 0 0 0 ${wr}  0 0 0 0 ${wg}  0 0 0 0 ${wb}  -6 0 6 0 -0.9"/>
  <feComposite in="w0" in2="lum" operator="in" result="water"/>
  <feColorMatrix in="SourceGraphic" type="matrix" result="g0" values="
    0 0 0 0 ${gr}  0 0 0 0 ${gg}  0 0 0 0 ${gb}  0 12 -12 0 -0.6"/>
  <feColorMatrix in="SourceGraphic" type="matrix" result="g1" values="
    0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -16 16 0 0 -0.5"/>
  <feComposite in="g0" in2="g1" operator="in" result="g2"/>
  <feComposite in="g2" in2="lum" operator="in" result="green"/>
  <feMerge><feMergeNode in="gray"/><feMergeNode in="water"/><feMergeNode in="green"/></feMerge>
</filter>`;
}

/** 把濾鏡定義放進頁面一次（CSS 用 filter: url(#basemap-tone) 引用） */
function ensureFilter() {
  if (document.getElementById(FILTER_ID)) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.innerHTML = filterMarkup();
  document.body.appendChild(svg);
}

export function BaseMap() {
  const map = useMap();

  useEffect(() => {
    ensureFilter();
    let index = 0;
    let errors = 0;
    let layer: L.TileLayer | null = null;

    const use = (i: number) => {
      layer?.remove();
      index = i;
      errors = 0;
      const source = SOURCES[i];
      layer = L.tileLayer(source.url, {
        attribution: source.attribution,
        maxZoom: 19,
        className: "basemap-muted",
      });
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
