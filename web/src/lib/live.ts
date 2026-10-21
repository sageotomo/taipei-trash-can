// 「即時」填滿度：填滿資料是一週 168 小時的模擬（週一 00:00 起），
// 這裡把現在的台北時間對應到模擬裡同一個星期幾、同一個小時。

import { useEffect, useState } from "react";

const WEEKDAY = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 } as const;

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Taipei",
  weekday: "short",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

export interface LiveTime {
  /** 模擬資料的小時索引 0–167 */
  hour: number;
  /** 台北時間 HH:MM */
  clock: string;
}

export function liveTime(now: Date): LiveTime {
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const day = WEEKDAY[parts.weekday as keyof typeof WEEKDAY] ?? 0;
  const h = Number(parts.hour) % 24;
  return { hour: day * 24 + h, clock: `${String(h).padStart(2, "0")}:${parts.minute}` };
}

/** 每 30 秒更新一次現在時間 */
export function useLiveTime(): LiveTime {
  const [t, setT] = useState(() => liveTime(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setT(liveTime(new Date())), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return t;
}

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** 離 (lat, lng) 最近的 k 個點，回傳索引與距離（公尺） */
export function nearest(points: { lat: number; lng: number }[], lat: number, lng: number, k: number) {
  return points
    .map((p, i) => ({ i, d: distanceM(lat, lng, p.lat, p.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k);
}

/** 填滿度分級：給市民看的字 */
export function fillStatus(level: number): { label: string; tone: "ok" | "warn" | "full" } {
  if (level >= 100) return { label: "已滿", tone: "full" };
  if (level >= 80) return { label: "快滿了", tone: "full" };
  if (level >= 50) return { label: "半滿", tone: "warn" };
  return { label: "有空位", tone: "ok" };
}

/** 步行分鐘數（每分鐘約 80 公尺） */
export function walkMinutes(m: number): number {
  return Math.max(1, Math.round(m / 80));
}
