"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection, query, where, orderBy, onSnapshot, doc, getDoc, updateDoc, deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth-provider";
import { AuthStatus } from "@/components/auth-status";
import { ListingCard } from "@/components/listing-card";
import type { AlertItem, Favorite, Listing, SavedSearch } from "@/lib/types";

export default function MyPage() {
  const { user, loading, signInGoogle } = useAuth();
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [favs, setFavs] = useState<Favorite[]>([]);
  const [favListings, setFavListings] = useState<Listing[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const unsubs = [
      onSnapshot(query(collection(db, "savedSearches"), where("userId", "==", uid)), (s) => setSaved(s.docs.map((d) => d.data() as SavedSearch))),
      onSnapshot(query(collection(db, "favorites"), where("userId", "==", uid)), (s) => setFavs(s.docs.map((d) => d.data() as Favorite))),
      onSnapshot(query(collection(db, "alerts"), where("userId", "==", uid), orderBy("sentAt", "desc")), (s) => setAlerts(s.docs.map((d) => d.data() as AlertItem))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  useEffect(() => {
    (async () => {
      const out: Listing[] = [];
      for (const f of favs) {
        const s = await getDoc(doc(db, "listings", f.listingId));
        if (s.exists() && s.get("status") === "published") out.push(s.data() as Listing);
      }
      setFavListings(out);
    })();
  }, [favs]);

  if (loading) return <main className="flex h-dvh items-center justify-center text-muted">확인 중…</main>;
  if (!user)
    return (
      <main className="mx-auto flex h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-bold">로그인이 필요합니다</h1>
        <button onClick={signInGoogle} className="rounded-pill bg-sea px-5 py-2 font-medium text-paper">Google 로그인</button>
      </main>
    );

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold">마이</Link>
        <AuthStatus />
      </header>

      {/* 알림함 */}
      <section className="mt-6">
        <h2 className="font-medium">알림함 <span className="text-sm text-muted">({alerts.filter((a) => !a.read).length} 신규)</span></h2>
        <ul className="mt-2 space-y-1">
          {alerts.slice(0, 20).map((a) => (
            <li key={a.id}>
              <Link
                href={a.listingId ? `/listing/${a.listingId}` : "/search"}
                onClick={() => updateDoc(doc(db, "alerts", a.id), { read: true })}
                className={"flex items-center gap-2 rounded-card px-3 py-2 text-sm " + (a.read ? "text-muted" : "bg-sea-soft text-sea")}
              >
                <span className="rounded-pill bg-basalt px-2 py-0.5 text-xs text-paper">
                  {a.type === "new_listing" ? "신규" : a.type === "price_drop" ? "가격인하" : "변동"}
                </span>
                <span className="num text-xs">{new Date(a.sentAt).toLocaleString("ko-KR")}</span>
              </Link>
            </li>
          ))}
          {alerts.length === 0 && <li className="text-sm text-muted">알림 없음</li>}
        </ul>
      </section>

      {/* 저장검색 */}
      <section className="mt-6">
        <h2 className="font-medium">저장검색</h2>
        <ul className="mt-2 space-y-2">
          {saved.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-card border border-stone/40 px-3 py-2 text-sm">
              <Link href="/search" className="num min-w-0 flex-1 truncate text-sea">
                {[s.filters.region, s.filters.keyword, ...(s.filters.themes ?? [])].filter(Boolean).join(" · ") || "전체"} / 정렬 {s.filters.sort}
              </Link>
              <select value={s.alertFreq} onChange={(e) => updateDoc(doc(db, "savedSearches", s.id), { alertFreq: e.target.value })} className="rounded border border-stone px-2 py-1 text-xs">
                <option value="instant">즉시</option><option value="daily">일간</option><option value="off">끔</option>
              </select>
              <button onClick={() => deleteDoc(doc(db, "savedSearches", s.id))} className="text-xs text-tangerine">삭제</button>
            </li>
          ))}
          {saved.length === 0 && <li className="text-sm text-muted">저장한 검색 없음 — 검색 화면에서 “검색 저장”</li>}
        </ul>
      </section>

      {/* 찜 (가격추적) */}
      <section className="mt-6">
        <h2 className="font-medium">찜 <span className="text-sm text-muted">가격 추적 중</span></h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {favListings.map((l) => <ListingCard key={l.id} listing={l} />)}
        </div>
        {favListings.length === 0 && <p className="mt-2 text-sm text-muted">찜한 매물 없음</p>}
      </section>
    </main>
  );
}
