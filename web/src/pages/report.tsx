// 掃 QR code 後打開的通報頁（report.html）：只有市民通報表單，沒有地圖。
// 垃圾桶編號：網址有 ?bin=B0365 就用它，沒有就從真實垃圾桶裡隨機挑一個（展示用）。
// 送出到 /api/reports，政府單位視角的「市民通報」會在 10 秒內出現這筆。

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import "./report.css";
import { ReportForm } from "../tabs/ReportForm";
import type { ReportInput } from "../lib/reports";
import type { BinProps, FeatureCollection } from "../types";

type Bin = Pick<BinProps, "id" | "district" | "road">;

async function pickBin(): Promise<Bin> {
  const r = await fetch("./data/bins.geojson");
  if (!r.ok) throw new Error("垃圾桶資料載入失敗");
  const fc = (await r.json()) as FeatureCollection<BinProps>;
  const want = new URLSearchParams(location.search).get("bin");
  const found = want ? fc.features.find((f) => f.properties.id === want) : undefined;
  const f = found ?? fc.features[Math.floor(Math.random() * fc.features.length)];
  return { id: f.properties.id, district: f.properties.district, road: f.properties.road };
}

async function send(bin: string, input: ReportInput): Promise<string> {
  let r: Response;
  try {
    r = await fetch("./api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bin, ...input }),
    });
  } catch {
    throw new Error("網路連線失敗，請再按一次送出。");
  }
  const text = await r.text();
  let out: { id?: string; error?: string } = {};
  try {
    out = JSON.parse(text);
  } catch {
    // 不是我們 API 回的 JSON（例如 Cloudflare 的錯誤頁、登入頁）：把狀態碼和開頭顯示出來方便除錯
  }
  if (r.ok && out.id) return out.id;
  if (out.error) throw new Error(out.error);
  const snippet = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  throw new Error(`送出失敗（HTTP ${r.status}${r.redirected ? "，被轉址" : ""}）${snippet ? "：" + snippet : ""}`);
}

function ReportPage() {
  const [bin, setBin] = useState<Bin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);

  useEffect(() => {
    pickBin().then(setBin, (e: Error) => setError(e.message));
  }, []);

  return (
    <main className="report-page">
      <img className="report-logo" src="./brand/logo.png" alt="桶桶沒問題！" width="640" height="199" />
      <p className="lead">看到垃圾桶滿出來、附近有人亂丟？告訴承辦單位，不用登入。</p>
      {error ? <p className="warn-text">{error}，請重新整理。</p> : null}
      {!bin && !error ? <p className="muted">載入中…</p> : null}
      {bin && sentId ? (
        <div className="hint-box sent-box">
          <strong>已送出，通報編號 {sentId}</strong>
          <span>承辦單位會在「市民通報」案件表看到這筆，處理後更新進度。</span>
          <button className="button" onClick={() => setSentId(null)}>
            再通報一筆
          </button>
        </div>
      ) : null}
      {bin && !sentId ? (
        <div className="detail">
          <div className="detail-head">
            <div>
              <div className="form-title">新增通報</div>
              <div className="muted">
                垃圾桶 {bin.id}・{bin.district} {bin.road}
              </div>
            </div>
          </div>
          <ReportForm onSubmit={async (input) => setSentId(await send(bin.id, input))} />
        </div>
      ) : null}
      <p className="footnote muted">市政 debug松 展示作品，不是臺北市政府的正式通報管道。</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReportPage />
  </StrictMode>
);
