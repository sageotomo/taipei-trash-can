// 市民通報：政府單位視角。所有通報當成「案件」列成表格，承辦單位可以篩選、排序、匯出。
import { useEffect, useMemo, useRef, useState } from "react";
import type { Placer } from "../lib/place";
import { ACTIONS, CATEGORIES, shortDateTime, suggestAction } from "../lib/reports";
import { casesToCsv, type ReportCase } from "../lib/cases";
import { Section, SourceTag, Swatch, fmt } from "../ui";
import type { AppData } from "../data";
import { CATEGORY_COLORS, useBinStats } from "./Reports";

type SortKey = "id" | "category" | "bin" | "owner";
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "id", label: "編號・通報日" },
  { key: "category", label: "類別・地點" },
  { key: "bin", label: "垃圾桶編號" },
  { key: "owner", label: "承辦單位" },
];

interface Props {
  data: AppData;
  place: Placer;
  cases: ReportCase[];
  reportCounts: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const short = (d: string) => d.slice(5).replace("-", "/");

export function ReportGovPanel({ data, place, cases, reportCounts, selectedId, onSelect }: Props) {
  const [category, setCategory] = useState("全部");
  const [district, setDistrict] = useState("全部");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "id", desc: true });
  const selectedRow = useRef<HTMLTableRowElement | null>(null);
  const binStats = useBinStats(data);

  const places = useMemo(() => new Map(cases.map((c) => [c.report.id, place([c.report.lat, c.report.lng], c.district)])), [cases, place]);
  const districts = useMemo(() => ["全部", ...Array.from(new Set(cases.map((c) => c.district))).sort()], [cases]);

  const summary = useMemo(() => CATEGORIES.map((cat) => ({ cat, n: cases.filter((c) => c.report.category === cat).length })), [cases]);

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const list = cases.filter((c) => {
      if (category !== "全部" && c.report.category !== category) return false;
      if (district !== "全部" && c.district !== district) return false;
      if (q) {
        const hay = [c.report.id, places.get(c.report.id) ?? "", c.bin?.id ?? "", c.report.note ?? "", c.owner].join(" ").toUpperCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const value = (c: ReportCase): string | number => {
      switch (sort.key) {
        case "category":
          return `${c.report.category}${places.get(c.report.id) ?? ""}`;
        case "bin":
          return c.bin?.id ?? "￿"; // 沒有桶的排最後
        case "owner":
          return `${c.owner}${c.report.created_at}`;
        default:
          return `${c.report.created_at}${c.report.id}`;
      }
    };
    return list.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === "number" ? va - (vb as number) : va.localeCompare(vb as string, "zh-TW");
      return sort.desc ? -cmp : cmp;
    });
  }, [cases, category, district, query, sort, places]);

  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key === "id" }));

  const exportCsv = () => {
    const csv = casesToCsv(rows, (c) => places.get(c.report.id) ?? "");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `市民通報案件_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const selected = selectedId ? cases.find((c) => c.report.id === selectedId) ?? null : null;

  return (
    <>
      <p className="lead">所有市民通報都是一件案件，依類別自動分派：亂丟垃圾給環保稽查大隊，垃圾桶滿溢與家戶垃圾給該區清潔隊。</p>

      <div className="fill-summary">
        {summary.map(({ cat, n }) => (
          <div key={cat}>
            <Swatch color={CATEGORY_COLORS[cat]} />
            <span>{cat}</span>
            <strong>{fmt(n)}</strong>
          </div>
        ))}
      </div>

      {selected ? (
        <CaseDetail
          c={selected}
          placeLabel={places.get(selected.report.id) ?? ""}
          count={reportCounts.get(selected.report.cell) ?? 0}
          stats={binStats.get(selected.report.cell)}
        />
      ) : null}

      <Section title="通報案件" aside={<SourceTag source={data.sources.find((s) => s.key === "reports")} />}>
        <div className="table-tools">
          <div className="table-filters three">
            <label className="select">
              <span className="sr-only">類別</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="全部">全部類別</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="select">
              <span className="sr-only">行政區</span>
              <select value={district} onChange={(e) => setDistrict(e.target.value)}>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d === "全部" ? "全部行政區" : d}
                  </option>
                ))}
              </select>
            </label>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋編號、地點、垃圾桶編號"
              aria-label="搜尋案件"
            />
          </div>
        </div>

        <div className="table-meta">
          <p className="footnote">共 {fmt(rows.length)} 件。點欄位名稱排序，點一列在地圖上找到它，並在上方顯示案件詳情。</p>
          <button className="button small" onClick={exportCsv} disabled={rows.length === 0}>
            匯出 CSV
          </button>
        </div>

        <div className="bin-table-wrap">
          <table className="bin-table case-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} aria-sort={sort.key === col.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                    <button onClick={() => toggleSort(col.key)}>
                      {col.label}
                      <span className="sort-mark" aria-hidden="true">
                        {sort.key === col.key ? (sort.desc ? "▼" : "▲") : ""}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const r = c.report;
                const active = r.id === selectedId;
                return (
                  <tr
                    key={r.id}
                    ref={active ? selectedRow : undefined}
                    className={active ? "active" : undefined}
                    onClick={() => onSelect(r.id)}
                  >
                    <td className="nowrap">
                      {r.id}
                      {r.local ? <span className="new-tag">新</span> : null}
                      {r.qr ? <span className="new-tag" title={`掃垃圾桶 ${r.bin} 的 QR code 通報`}>掃碼</span> : null}
                      {r.photo ? <span title="有照片" className="attach-photo" aria-label="有照片" /> : null}
                      <small>{short(r.created_at)}・{c.age === 0 ? "今天" : `${c.age} 天前`}</small>
                      {r.occurred_at ? <small>發生 {shortDateTime(r.occurred_at)}</small> : null}
                    </td>
                    <td>
                      <span className="nowrap">
                        <Swatch color={CATEGORY_COLORS[r.category]} />
                        {r.category}
                      </span>
                      <small>{places.get(r.id)}</small>
                      {r.note ? <small className="clip">「{r.note}」</small> : null}
                    </td>
                    <td className="nowrap">
                      {c.bin ? (
                        <>
                          {c.bin.id}
                          <small>{c.bin.dist} 公尺</small>
                        </>
                      ) : (
                        <span className="muted">附近無桶</span>
                      )}
                    </td>
                    <td className="nowrap">{c.owner}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="muted empty">沒有符合條件的案件。</p> : null}
        </div>
        <p className="footnote">
          編號旁的小圖示：有照片。垃圾桶編號：通報地點 150 公尺內最近的垃圾桶。
        </p>
      </Section>
    </>
  );
}

function CaseDetail({ c, placeLabel, count, stats }: {
  c: ReportCase;
  placeLabel: string;
  count: number;
  stats?: { bins: number; overflowSum: number };
}) {
  const r = c.report;
  const bins = stats?.bins ?? 0;
  const action = suggestAction(count, bins, stats && stats.bins > 0 ? stats.overflowSum / stats.bins : 0);
  return (
    <div className="detail case-detail">
      <div className="case-detail-main">
        <div className="detail-head">
          <div>
            <div className="form-title">
              {r.id}・{r.category}
            </div>
            <div className="muted">{placeLabel}</div>
          </div>
        </div>
        <dl className="case-facts">
          <div>
            <dt>通報</dt>
            <dd>{r.created_at}</dd>
          </div>
          <div>
            <dt>發生</dt>
            <dd>{r.occurred_at ? r.occurred_at.replace("T", " ") : "未填（歷史通報）"}</dd>
          </div>
          <div>
            <dt>承辦</dt>
            <dd>{c.owner}</dd>
          </div>
          <div>
            <dt>垃圾桶</dt>
            <dd>{c.bin ? `${c.bin.id}（${c.bin.dist} 公尺）` : "150 公尺內沒有"}</dd>
          </div>
          {r.note ? (
            <div className="wide">
              <dt>說明</dt>
              <dd>{r.note}</dd>
            </div>
          ) : null}
          <div className="wide">
            <dt>這一格</dt>
            <dd>
              通報 {count} 件、垃圾桶 {bins} 個 → 建議<strong>{ACTIONS[action].label}</strong>
            </dd>
          </div>
        </dl>
      </div>
      {r.photo ? <img className="case-photo" src={r.photo} alt={`${r.id} 的現場照片`} /> : null}
    </div>
  );
}
