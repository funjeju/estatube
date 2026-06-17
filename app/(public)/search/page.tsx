"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getDocs, doc, setDoc, type QueryDocumentSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth-provider";
import { ListingCard } from "@/components/listing-card";
import { buildListingQuery, applyClientFilters, sortListings, PAGE_SIZE } from "@/lib/search";
import {
  PROPERTY_TYPES, DEAL_TYPES, THEMES,
  type Listing, type SearchFilters, type PropertyType, type DealType, type Theme,
} from "@/lib/types";

const SORTS: { v: SearchFilters["sort"]; label: string }[] = [
  { v: "latest", label: "최신" },
  { v: "price_asc", label: "가격↑" },
  { v: "price_desc", label: "가격↓" },
  { v: "area", label: "면적" },
  { v: "price_drop", label: "가격인하" },
  { v: "just_posted", label: "방금게시" },
];

export default function SearchPage() {
  const { user, signInGoogle } = useAuth();
  const [filters, setFilters] = useState<SearchFilters>({ sort: "latest" });
  const [kwInput, setKwInput] = useState("");
  const [appliedKw, setAppliedKw] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<Listing[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const serverFilters = useMemo<SearchFilters>(() => ({ sort: filters.sort, keyword: appliedKw }), [filters.sort, appliedKw]);

  const load = useCallback(
    async (reset: boolean) => {
      if (loading) return;
      setLoading(true);
      setErr(null);
      try {
        const q = buildListingQuery(db, serverFilters, reset ? null : cursor);
        const snap = await getDocs(q);
        const page = snap.docs.map((d) => d.data() as Listing);
        setItems((prev) => (reset ? page : [...prev, ...page]));
        setCursor(snap.docs[snap.docs.length - 1] ?? null);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } catch (e) {
        setErr(`검색 실패(인덱스 확인): ${String(e instanceof Error ? e.message : e)}`);
      } finally {
        setLoading(false);
      }
    },
    [loading, cursor, serverFilters],
  );

  // 키워드 적용 시 처음부터 다시
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKw]);

  // 무한스크롤
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && hasMore && !loading) load(false);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, load]);

  const shown = useMemo(() => sortListings(applyClientFilters(items, filters), filters.sort), [items, filters]);

  const toggle = <T,>(arr: T[] | undefined, v: T): T[] => (arr?.includes(v) ? arr.filter((x) => x !== v) : [...(arr ?? []), v]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-bold">탐라인덱스</Link>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (!user) return signInGoogle();
              const id = `${user.uid}_${Date.now()}`;
              await setDoc(doc(db, "savedSearches", id), {
                id, userId: user.uid,
                filters: { ...filters, keyword: appliedKw },
                alertFreq: "daily", createdAt: Date.now(),
              });
              alert("검색을 저장했습니다. 마이에서 알림주기를 설정하세요.");
            }}
            className="rounded-pill border border-sea px-3 py-1 text-sm text-sea"
          >
            검색 저장
          </button>
          <Link href="/" className="rounded-pill border border-stone px-3 py-1 text-sm text-muted">지도</Link>
        </div>
      </div>

      {/* 키워드 */}
      <div className="mt-4 flex gap-2">
        <input
          value={kwInput}
          onChange={(e) => setKwInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setAppliedKw(kwInput.trim() || undefined)}
          placeholder="영상 키워드 (바다뷰·돌담·주차·신축·급매…)"
          className="flex-1 rounded-card border border-stone px-3 py-2"
        />
        <button onClick={() => setAppliedKw(kwInput.trim() || undefined)} className="rounded-pill bg-sea px-4 text-paper">검색</button>
      </div>

      {/* 필터 */}
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {PROPERTY_TYPES.map((t) => (
            <Chip key={t} on={!!filters.propertyType?.includes(t)} onClick={() => setFilters((f) => ({ ...f, propertyType: toggle<PropertyType>(f.propertyType, t) }))}>{t}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DEAL_TYPES.map((t) => (
            <Chip key={t} on={!!filters.dealType?.includes(t)} onClick={() => setFilters((f) => ({ ...f, dealType: toggle<DealType>(f.dealType, t) }))}>{t}</Chip>
          ))}
          {THEMES.map((t) => (
            <Chip key={t} on={!!filters.themes?.includes(t)} onClick={() => setFilters((f) => ({ ...f, themes: toggle<Theme>(f.themes, t) }))}>{t}</Chip>
          ))}
        </div>
        <div className="num flex flex-wrap items-center gap-2">
          <input type="number" placeholder="최소가(만)" className="w-28 rounded border border-stone px-2 py-1" onChange={(e) => setFilters((f) => ({ ...f, priceMinManwon: e.target.value ? Number(e.target.value) : undefined }))} />
          <span>~</span>
          <input type="number" placeholder="최대가(만)" className="w-28 rounded border border-stone px-2 py-1" onChange={(e) => setFilters((f) => ({ ...f, priceMaxManwon: e.target.value ? Number(e.target.value) : undefined }))} />
          <input type="number" placeholder="최소평" className="w-24 rounded border border-stone px-2 py-1" onChange={(e) => setFilters((f) => ({ ...f, areaMinPyeong: e.target.value ? Number(e.target.value) : undefined }))} />
          <input placeholder="읍·면·동" className="w-32 rounded border border-stone px-2 py-1" onChange={(e) => setFilters((f) => ({ ...f, region: e.target.value || undefined }))} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <Chip key={s.v} on={filters.sort === s.v} onClick={() => setFilters((f) => ({ ...f, sort: s.v }))}>{s.label}</Chip>
          ))}
        </div>
      </div>

      {err && <p className="mt-4 rounded-card bg-tangerine/10 px-4 py-2 text-sm text-tangerine">{err}</p>}

      <p className="mt-4 text-sm text-muted">{shown.length}건 표시</p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((l) => <ListingCard key={l.id} listing={l} />)}
      </div>
      {shown.length === 0 && !loading && (
        <p className="mt-10 text-center text-muted">조건에 맞는 매물이 없습니다. 필터를 넓혀 보세요.</p>
      )}
      <div ref={sentinel} className="h-10" />
      {loading && <p className="py-4 text-center text-sm text-muted">불러오는 중…</p>}
    </main>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={"rounded-pill px-3 py-1 transition " + (on ? "bg-sea text-paper" : "border border-stone text-muted hover:bg-sea-soft")}>
      {children}
    </button>
  );
}
