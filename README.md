# 找回消失的垃圾桶

市政 debug松 題目 #2。用人流、店家與市民通報，算出台北哪裡最缺垃圾桶，並公開增設進度。

## 專案結構

```text
pipeline/   Python：把原始資料算成靜態 JSON（只需要跑一次）
web/        Vite + React + TypeScript + Leaflet：讀 JSON、畫地圖
data/raw/   原始下載檔（不進 git）
```

## 開發

```bash
cd web
npm install
npm run dev
```
