"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";

const REGIONS = [
  "제주 전역",
  "제주시 애월읍",
  "제주시 조천읍",
  "제주시 한림읍",
  "제주시 한경면",
  "제주시 구좌읍",
  "제주시 노형동",
  "서귀포시 대정읍",
  "서귀포시 안덕면",
  "서귀포시 남원읍",
  "서귀포시 표선면",
  "서귀포시 성산읍",
];

interface JobItem {
  videoId: string;
  step: string;
  source: string;
  status: string;
  error?: string;
}
interface Job {
  region: string;
  query: string;
  jobId: string;
  found: number;
  processed: number;
  failed: number;
  skipped: number;
  items?: JobItem[];
  error?: string;
}
interface CollectResponse {
  ok: boolean;
  by?: string;
  totals?: { found: number; processed: number; failed: number; skipped: number };
  jobs?: Job[];
  error?: string;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "text-sea",
  error: "text-tangerine",
  opted_out: "text-muted",
  duplicate: "text-muted",
};

export default function CollectConsole() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [regions, setRegions] = useState<string[]>(["제주 전역"]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CollectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleRegion = (r: string) =>
    setRegions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const collect = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ from, to, regions }),
      });
      const json: CollectResponse = await res.json();
      if (!res.ok) throw new Error(json.error ?? `수집 실패 (${res.status})`);
      setResult(json);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold">수집 콘솔</h1>
      <p className="mt-1 text-sm text-muted">
        기간·지역을 정해 유튜브 매물을 수집합니다. 중복·옵트아웃은 자동 스킵됩니다.
      </p>

      <section className="mt-6 rounded-card border border-stone/50 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="mb-1 block text-muted">시작일</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="num rounded-card border border-stone px-3 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">종료일</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="num rounded-card border border-stone px-3 py-1.5"
            />
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-sm text-muted">지역 (복수 선택)</legend>
          <div className="flex flex-wrap gap-2">
            {REGIONS.map((r) => {
              const on = regions.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRegion(r)}
                  className={
                    "rounded-pill px-3 py-1.5 text-sm transition " +
                    (on ? "bg-sea text-paper" : "border border-stone text-muted hover:bg-sea-soft")
                  }
                >
                  {r}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={collect}
            disabled={loading || !regions.length}
            className="rounded-pill bg-tangerine px-5 py-2 font-medium text-paper disabled:opacity-50"
          >
            {loading ? "수집 중…" : "매물 수집"}
          </button>
          <button
            type="button"
            disabled
            title="T6 크론에서 구현"
            className="rounded-pill border border-stone px-4 py-2 text-sm text-stone"
          >
            크론 설정 (예정)
          </button>
        </div>
      </section>

      {error && (
        <p className="mt-4 rounded-card bg-tangerine/10 px-4 py-3 text-sm text-tangerine">
          {error}
        </p>
      )}

      {result?.jobs && (
        <section className="mt-6 space-y-4">
          {result.totals && (
            <div className="num flex flex-wrap gap-4 rounded-card bg-basalt px-4 py-3 text-sm text-paper">
              <span>발견 {result.totals.found}</span>
              <span className="text-sea-soft">draft {result.totals.processed}</span>
              <span className="text-stone">스킵 {result.totals.skipped}</span>
              <span className="text-tangerine">실패 {result.totals.failed}</span>
            </div>
          )}
          {result.jobs.map((job) => (
            <div key={job.region} className="rounded-card border border-stone/50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {job.region}{" "}
                  <span className="text-sm text-muted">검색어 “{job.query}”</span>
                </span>
                <span className="num text-sm text-muted">
                  발견 {job.found} · draft {job.processed} · 스킵 {job.skipped} · 실패 {job.failed}
                </span>
              </div>
              {job.error && <p className="mt-2 text-sm text-tangerine">{job.error}</p>}
              {job.items && job.items.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs">
                  {job.items.map((it, i) => (
                    <li key={`${it.videoId}-${i}`} className="num flex gap-2">
                      <span className={STATUS_STYLE[it.status] ?? "text-basalt"}>
                        [{it.status}]
                      </span>
                      <span className="text-muted">{it.step}</span>
                      <span>{it.videoId}</span>
                      {it.error && <span className="text-tangerine">{it.error}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
