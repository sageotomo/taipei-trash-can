// 市民通報：政府單位視角。所有通報當成「案件」列成表格，承辦單位可以篩選、排序、改處理進度、匯出。
import { useEffect, useMemo, useRef, useState } from "react";
import type { Placer } from "../lib/place";
import { ACTIONS, CATEGORIES, shortDateTime, suggestAction } from "../lib/reports";
import { CASE_COLORS, CASE_STATUSES, SLA_DAYS, casesToCsv, maskContact, type CaseStatus, type ReportCase } from "../lib/cases";
import { Section, SourceTag, Swatch, fmt } from "../ui";
import type { AppData } from "../data";
import { CATEGORY_COLORS, useBinStats } from "./Reports";

type Filter = "all" | CaseStatus | "overdue";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "待處理", label: "待處理" },
  { id: "已派工", label: "已派工" },
  { id: "處理中", label: "處理中" },
  { id: "已結案", label: "已結案" },
  { id: "overdue", label: `逾期（超過 ${SLA_DAYS} 天）` },
];

type SortKey = "id" | "category" | "bin" | "status" | "updated";
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "id", label: "編號・通報日" },
  { key: "category", label: "類別・地點" },
  { key: "bin", label: "垃圾桶編號" },
  { key: "status", label: "處理進度" },
  { key: "updated", label: "承辦・更新" },
];

interface Props {
  data: AppData;
  place: Placer;
  cases: ReportCase[];
  reportCounts: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatus: (id: string, status: CaseStatus) => void;
}

const short = (d: string) => d.slice(5).replace("-", "/");

export function ReportGovPanel({ data, place, cases, reportCounts, selectedId, onSelect, onStatus }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState("全部");
  const [district, setDistrict] = useState("全部");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "id", desc: true });
  const selectedRow = useRef<HTMLTableRowElement | null>(null);
  const binStats = useBinStats(data);

  const places = useMemo(() => new Map(cases.map((c) => [c.report.id, place([c.report.lat, c.report.lng], c.district)])), [cases, place]);
  const districts = useMemo(() => ["全部", ...Array.from(new Set(cases.map((c) => c.district))).sort()], [cases]);

  const summary = useMemo(() => {
    const open = cases.filter((c) => c.status !== "已結案");
    const recent = cases.filter((c) => c.age <= 30);
    const closedRecent = recent.filter((c) => c.status === "已結案").length;
    return {
      waiting: cases.filter((c) => c.status === "待處理").length,
      working: cases.filter((c) => c.status === "已派工" || c.status === "處理中").length,
      overdue: open.filter((c) => c.overdue).length,
      rate: recent.length > 0 ? closedRecent / recent.length : 0,
    };
  }, [cases]);

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const list = cases.filter((c) => {
      if (filter === "overdue" ? !c.overdue : filter !== "all" && c.status !== filter) return false;
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
        case "status":
          return CASE_STATUSES.indexOf(c.status) * 1000 - c.age; // 同狀態裡，越舊越前面
        case "updated":
          return c.updated_at;
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
  }, [cases, filter, category, district, query, sort, places]);

  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key === "id" || key === "updated" }));

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
      <p className="lead">
        所有市民通報都是一件案件，依類別自動分派：亂丟垃圾給環保稽查大隊，垃圾桶滿溢與家戶垃圾給該區清潔隊。超過 {SLA_DAYS} 天沒結案標為逾期。
      </p>

      <div className="fill-summary four">
        <div>
          <Swatch color={CASE_COLORS.待處理} />
          <span>待處理</span>
          <strong>{fmt(summary.waiting)}</strong>
        </div>
        <div>
          <Swatch color={CASE_COLORS.處理中} />
          <span>派工／處理中</span>
          <strong>{fmt(summary.working)}</strong>
        </div>
        <div>
          <span className="overdue-dot" aria-hidden="true" />
          <span>逾期未結</span>
          <strong className={summary.overdue > 0 ? "tone-full" : undefined}>{fmt(summary.overdue)}</strong>
        </div>
        <div>
          <Swatch color={CASE_COLORS.已結案} />
          <span>近 30 天結案率</span>
          <strong>{Math.round(summary.rate * 100)}%</strong>
        </div>
      </div>

      {selected ? (
        <CaseDetail
          c={selected}
          placeLabel={places.get(selected.report.id) ?? ""}
          count={reportCounts.get(selected.report.cell) ?? 0}
          stats={binStats.get(selected.report.cell)}
          onStatus={onStatus}
        />
      ) : null}

      <Section title="通報案件" aside={<SourceTag source={data.sources.find((s) => s.key === "reports")} />}>
        <div className="table-tools">
          <div className="chips" role="radiogroup" aria-label="處理進度">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="radio"
                aria-checked={filter === f.id}
                className={filter === f.id ? "chip active" : "chip"}
                onClick={() => setFilter(f.id)}
              >
                {f.id !== "all" && f.id !== "overdue" ? <Swatch color={CASE_COLORS[f.id]} /> : null}
                {f.label}
              </button>
            ))}
          </div>
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
          <p className="footnote">共 {fmt(rows.length)} 件。點欄位名稱排序，點一列在地圖上找到它，在「處理進度」直接改狀態。</p>
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
                      {c.contact ? <span title="可回覆通報人" className="attach-contact" aria-label="有聯絡方式" /> : null}
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
                    <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                      <StatusSelect status={c.status} onChange={(s) => onStatus(r.id, s)} label={`${r.id} 的處理進度`} />
                      {c.overdue ? <span className="pill pill-full overdue-pill">逾期</span> : null}
                    </td>
                    <td className="nowrap">
                      {c.owner}
                      <small>{short(c.updated_at)} 更新</small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="muted empty">沒有符合條件的案件。</p> : null}
        </div>
        <p className="footnote">
          編號旁的小圖示：有照片、可回覆通報人。垃圾桶編號：通報地點 150 公尺內最近的垃圾桶。逾期：通報超過 {SLA_DAYS} 天仍未結案。匯出檔不含通報人的聯絡方式。
        </p>
      </Section>
    </>
  );
}

function StatusSelect({ status, onChange, label }: { status: CaseStatus; onChange: (s: CaseStatus) => void; label: string }) {
  return (
    <label className="status-select" style={{ ["--status" as string]: CASE_COLORS[status] }}>
      <span className="sr-only">{label}</span>
      <select value={status} onChange={(e) => onChange(e.target.value as CaseStatus)}>
        {CASE_STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </label>
  );
}

const NEXT: Partial<Record<CaseStatus, { to: CaseStatus; label: string }>> = {
  待處理: { to: "已派工", label: "派工" },
  已派工: { to: "處理中", label: "開始處理" },
  處理中: { to: "已結案", label: "結案" },
};

function CaseDetail({ c, placeLabel, count, stats, onStatus }: {
  c: ReportCase;
  placeLabel: string;
  count: number;
  stats?: { bins: number; overflowSum: number };
  onStatus: (id: string, s: CaseStatus) => void;
}) {
  const r = c.report;
  const bins = stats?.bins ?? 0;
  const action = suggestAction(count, bins, stats && stats.bins > 0 ? stats.overflowSum / stats.bins : 0);
  const next = NEXT[c.status];
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
          <span className="case-status big">
            <Swatch color={CASE_COLORS[c.status]} />
            {c.status}
            {c.overdue ? <span className="pill pill-full">逾期</span> : null}
          </span>
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
          <div>
            <dt>通報人</dt>
            <dd>{c.contact ? maskContact(c.contact) : "未留聯絡方式"}</dd>
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
        <div className="form-actions start">
          {next ? (
            <button className="button primary" onClick={() => onStatus(r.id, next.to)}>
              {next.label}
            </button>
          ) : null}
          {c.contact && c.status === "已結案" ? <span className="footnote">已通知通報人結案（示意）</span> : null}
        </div>
      </div>
      {r.photo ? <img className="case-photo" src={r.photo} alt={`${r.id} 的現場照片`} /> : null}
    </div>
  );
}
