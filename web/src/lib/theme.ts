// 地圖上用的顏色（Leaflet 的樣式要直接給色碼，不能用 CSS 變數）。
// 和 styles.css 的 :root 色票對應：深藍灰底、橘紅為主色、青綠為輔色。

export const MAP = {
  /** 點位外框：和底圖同色，讓點在深色地圖上有清楚的邊 */
  outline: "#131f24",
  /** 選取中的點或格子 */
  selected: "#f2f5f3",
  /** 強調（建議增設的格子、已滿的桶） */
  emphasis: "#ffb08f",
  /** 網格細框線 */
  gridLine: "#6f8a91",
  /** 不缺／沒資料的格子 */
  empty: "#ffffff",
  /** 不缺的格子在圖例上的樣子 */
  emptySwatch: "#2b3b45",
  /** 背景點（非重點） */
  dim: "#7d9095",
  /** 範圍圈 */
  ring: "#5aa0e0",
  /** 主色 */
  action: "#e16f4c",
  /** 主色底上的文字 */
  onAction: "#14202a",
  /** 淺色文字 */
  ink: "#e4ebe8",
} as const;
