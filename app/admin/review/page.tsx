"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth-provider";
import { fieldGate } from "@/lib/review";
import { THEMES, type Listing, type Theme } from "@/lib/types";

type Sort = "confidence" | "newest" | "region";
type Edits = Partial<Pick<Listing,
  "priceManwon" | "areaPyeong" | "region" | "propertyType" | "dealType" | "zoning" |
  "summary" | "keywords" | "themes" | "lat" | "lng">>;

const PROP_TYPES: Listing["propertyType"][] = ["단독주택","토지","상가","아파트","전원주택","상가주택","빌라","기타"];
const DEAL_TYPES: Listing["dealType"][] = ["매매","전세","월세","임대","경매"];

export default function ReviewQueue() {
  const { user } = useAuth();
  const [items, setItems] = useState<Listing[]>([]);
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>("confidence");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "listings"), where("status", "in", ["draft", "error"]));
    return onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => d.data() as Listing)),
      (err) => setMsg(`목록 로드 실패: ${err.message}`),
    );
  }, []);

  const sorted = useMemo(() => {
    const arr = [...items];
    if (sort === "confidence") arr.sort((a, b) => (a.confidence ?? 1) - (b.confidence ?? 1));
    else if (sort === "newest") arr.sort((a, b) => (b.collectedAt ?? 0) - (a.collectedAt ?? 0));
    else arr.sort((a, b) => (a.region ?? "").localeCompare(b.region ?? ""));
    return arr;
  }, [items, sort]);

  const val = <K extends keyof Edits>(l: Listing, k: K): Listing[K] =>
    (edits[l.id]?.[k] ?? l[k]) as Listing[K];
  const setEdit = (id: string, patch: Edits) =>
    setEdits((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const save = async (l: Listing) => {
    const e = edits[l.id];
    if (!e) return;
    await updateDoc(doc(db, "listings", l.id), { ...e, updatedAt: Date.now() });
    setEdits((p) => { const n = { ...p }; delete n[l.id]; return n; });
    setMsg(`저장됨: ${l.id}`);
  };

  const decide = async (ids: string[], action: "approve" | "reject") => {
    if (!user || !ids.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/review/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ ids, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `실패 (${res.status})`);
      const blocked = (json.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      setMsg(
        `게시 ${json.published} · 반려 ${json.rejected} · 차단 ${json.blocked}` +
          (blocked.length ? ` — ${blocked.map((b: { id: string; reasons?: string[] }) => `${b.id}: ${b.reasons?.join(", ")}`).join(" / ")}` : ""),
      );
      setSelected(new Set());
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const toggleSel = (id: string) =>
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">검수 큐</h1>
          <p className="text-sm text-muted">{items.length}건 대기 · 신뢰도 낮은 순 우선</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-muted">정렬</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-card border border-stone px-2 py-1"
          >
            <option value="confidence">신뢰도↓</option>
            <option value="newest">신규</option>
            <option value="region">지역</option>
          </select>
        </div>
      </div>

      {/* 배치 툴바 */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mt-4 flex items-center gap-3 rounded-card bg-basalt px-4 py-2 text-paper">
          <span className="num text-sm">{selected.size} 선택</span>
          <button onClick={() => decide([...selected], "approve")} disabled={busy} className="rounded-pill bg-tangerine px-3 py-1 text-sm disabled:opacity-50">일괄 승인·게시</button>
          <button onClick={() => decide([...selected], "reject")} disabled={busy} className="rounded-pill border border-stone px-3 py-1 text-sm disabled:opacity-50">일괄 반려</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-sm text-stone">선택 해제</button>
        </div>
      )}

      {msg && <p className="mt-4 rounded-card bg-sea-soft px-4 py-2 text-sm text-sea">{msg}</p>}

      <div className="mt-5 space-y-5">
        {sorted.map((l) => {
          const gate = fieldGate({
            priceManwon: Number(val(l, "priceManwon")),
            region: String(val(l, "region")),
            propertyType: val(l, "propertyType"),
            dealType: val(l, "dealType"),
          });
          const dirty = !!edits[l.id];
          const themes = (val(l, "themes") ?? []) as Theme[];
          return (
            <article key={l.id} className={"rounded-card border p-4 " + (l.status === "error" ? "border-tangerine/60" : "border-stone/50")}>
              <div className="flex gap-4">
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSel(l.id)} className="mt-1 h-4 w-4" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.thumbnailUrl} alt="" loading="lazy" className="aspect-video w-44 shrink-0 rounded-card object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={"rounded-pill px-2 py-0.5 " + (l.extractionSource === "ai" ? "bg-sea text-paper" : "bg-stone text-basalt")}>
                      {l.extractionSource === "ai" ? "AI" : "폴백"}
                    </span>
                    <span className="num text-muted">conf {Math.round((l.confidence ?? 0) * 100)}%</span>
                    {l.geoNeedsReview && <span className="rounded-pill bg-tangerine/15 px-2 py-0.5 text-tangerine">핀 보정 필요</span>}
                    {l.status === "error" && <span className="rounded-pill bg-tangerine px-2 py-0.5 text-paper">error</span>}
                    <a href={l.videoUrl} target="_blank" rel="noreferrer" className="text-sea underline">영상</a>
                  </div>

                  {/* 인라인 수정 */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <label className="col-span-1">가격(만원)
                      <input type="number" value={Number(val(l, "priceManwon")) || 0} onChange={(e) => setEdit(l.id, { priceManwon: Number(e.target.value) })} className="num mt-0.5 w-full rounded border border-stone px-2 py-1" />
                    </label>
                    <label>면적(평)
                      <input type="number" value={Number(val(l, "areaPyeong")) || 0} onChange={(e) => setEdit(l.id, { areaPyeong: Number(e.target.value) })} className="num mt-0.5 w-full rounded border border-stone px-2 py-1" />
                    </label>
                    <label>유형
                      <select value={val(l, "propertyType")} onChange={(e) => setEdit(l.id, { propertyType: e.target.value as Listing["propertyType"] })} className="mt-0.5 w-full rounded border border-stone px-2 py-1">
                        {PROP_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </label>
                    <label>거래
                      <select value={val(l, "dealType")} onChange={(e) => setEdit(l.id, { dealType: e.target.value as Listing["dealType"] })} className="mt-0.5 w-full rounded border border-stone px-2 py-1">
                        {DEAL_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </label>
                    <label className="col-span-2">지역(읍·면·동)
                      <input value={String(val(l, "region") ?? "")} onChange={(e) => setEdit(l.id, { region: e.target.value })} className="mt-0.5 w-full rounded border border-stone px-2 py-1" />
                    </label>
                    <label>용도지역
                      <input value={String(val(l, "zoning") ?? "")} onChange={(e) => setEdit(l.id, { zoning: e.target.value || null })} className="mt-0.5 w-full rounded border border-stone px-2 py-1" />
                    </label>
                    <label className="num">좌표(lat,lng)
                      <div className="mt-0.5 flex gap-1">
                        <input type="number" step="0.0001" value={Number(val(l, "lat")) || 0} onChange={(e) => setEdit(l.id, { lat: Number(e.target.value) })} className="w-full rounded border border-stone px-1 py-1" />
                        <input type="number" step="0.0001" value={Number(val(l, "lng")) || 0} onChange={(e) => setEdit(l.id, { lng: Number(e.target.value) })} className="w-full rounded border border-stone px-1 py-1" />
                      </div>
                    </label>
                    <label className="col-span-2 sm:col-span-4">요약
                      <textarea value={String(val(l, "summary") ?? "")} onChange={(e) => setEdit(l.id, { summary: e.target.value })} rows={2} className="mt-0.5 w-full rounded border border-stone px-2 py-1" />
                    </label>
                    <label className="col-span-2 sm:col-span-4">키워드(쉼표)
                      <input value={(val(l, "keywords") ?? []).join(", ")} onChange={(e) => setEdit(l.id, { keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="mt-0.5 w-full rounded border border-stone px-2 py-1" />
                    </label>
                  </div>

                  {/* 테마 */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {THEMES.map((t) => {
                      const on = themes.includes(t);
                      return (
                        <button key={t} type="button"
                          onClick={() => setEdit(l.id, { themes: on ? themes.filter((x) => x !== t) : [...themes, t] })}
                          className={"rounded-pill px-2 py-0.5 text-xs " + (on ? "bg-sea text-paper" : "border border-stone text-muted")}>
                          {t}
                        </button>
                      );
                    })}
                  </div>

                  {/* 게이트 + 액션 */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {dirty && <button onClick={() => save(l)} className="rounded-pill bg-sea px-3 py-1 text-sm text-paper">수정 저장</button>}
                    <button onClick={() => decide([l.id], "approve")} disabled={busy || !gate.ok}
                      title={gate.ok ? "" : gate.reasons.join(", ")}
                      className="rounded-pill bg-tangerine px-3 py-1 text-sm text-paper disabled:cursor-not-allowed disabled:opacity-40">
                      승인·게시
                    </button>
                    <button onClick={() => decide([l.id], "reject")} disabled={busy} className="rounded-pill border border-stone px-3 py-1 text-sm">반려</button>
                    {!gate.ok && <span className="text-xs text-tangerine">게시 불가: {gate.reasons.join(", ")} · 중개사 verified는 게시 시 서버 확인</span>}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {sorted.length === 0 && (
          <p className="rounded-card border border-dashed border-stone px-4 py-10 text-center text-muted">
            검수 대기 없음. 수집 콘솔에서 기간을 정해 가져오세요.
          </p>
        )}
      </div>
    </main>
  );
}
