"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ListingCard } from "@/components/listing-card";
import type { Listing } from "@/lib/types";

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

/* eslint-disable @next/next/no-img-element */
type Kakao = any;
declare global {
  interface Window {
    kakao: Kakao;
  }
}

export default function Home() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapObj = useRef<Kakao>(null);
  const clusterer = useRef<Kakao>(null);
  const [ready, setReady] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [areaOnly, setAreaOnly] = useState(false);
  const [mapOpen, setMapOpen] = useState(false); // 모바일 지도 오버레이

  // 매물 구독
  useEffect(
    () =>
      onSnapshot(query(collection(db, "listings"), where("status", "==", "published")), (snap) =>
        setListings(snap.docs.map((d) => d.data() as Listing)),
      ),
    [],
  );

  // 카카오 SDK 로드 + 지도 초기화
  useEffect(() => {
    if (!KAKAO_KEY) return;
    const init = () => {
      const kakao = window.kakao;
      const map = new kakao.maps.Map(mapEl.current, {
        center: new kakao.maps.LatLng(33.38, 126.55),
        level: 9,
      });
      mapObj.current = map;
      clusterer.current = new kakao.maps.MarkerClusterer({ map, averageCenter: true, minLevel: 6 });
      setReady(true);
    };
    if (window.kakao?.maps) {
      window.kakao.maps.load(init);
      return;
    }
    const s = document.createElement("script");
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false&libraries=clusterer`;
    s.async = true;
    s.onload = () => window.kakao.maps.load(init);
    document.head.appendChild(s);
  }, []);

  // 마커
  useEffect(() => {
    if (!ready || !mapObj.current || !clusterer.current) return;
    const kakao = window.kakao;
    let shown = listings.filter((l) => l.lat != null && l.lng != null);
    if (areaOnly) {
      const b = mapObj.current.getBounds();
      shown = shown.filter((l) => b.contain(new kakao.maps.LatLng(l.lat, l.lng)));
    }
    const markers = shown.map((l) => {
      const m = new kakao.maps.Marker({ position: new kakao.maps.LatLng(l.lat, l.lng) });
      kakao.maps.event.addListener(m, "click", () => setSelected(l));
      return m;
    });
    clusterer.current.clear();
    clusterer.current.addMarkers(markers);
  }, [ready, listings, areaOnly]);

  const openMap = () => {
    setMapOpen(true);
    setTimeout(() => mapObj.current?.relayout(), 120);
  };

  return (
    <div className="lg:flex lg:h-dvh">
      {/* ── 리스트 (주인공) ── */}
      <section className="border-stone/30 lg:h-dvh lg:w-[480px] lg:overflow-y-auto lg:border-r">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-stone/30 bg-paper/95 px-4 py-3 backdrop-blur">
          <Link href="/" className="font-bold">탐라인덱스</Link>
          <span className="num text-sm text-muted">{listings.length} 매물</span>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Link href="/search" className="rounded-pill bg-sea px-3 py-1 text-paper">검색</Link>
            <Link href="/themes" className="text-muted">테마</Link>
            <Link href="/my" className="text-muted">마이</Link>
          </div>
        </header>

        {listings.length === 0 ? (
          <p className="px-4 py-16 text-center text-muted">
            아직 게시된 매물이 없습니다.<br />수집 콘솔에서 가져오거나 잠시 후 다시 확인하세요.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-3">
            {listings.map((l) => (
              <div
                key={l.id}
                onMouseEnter={() => setSelected(l)}
                className={selected?.id === l.id ? "rounded-card ring-2 ring-sea" : ""}
              >
                <ListingCard listing={l} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 지도 (옆/오버레이) ── */}
      <section
        className={
          (mapOpen ? "fixed inset-0 z-30 " : "hidden ") +
          "lg:relative lg:z-0 lg:block lg:h-dvh lg:flex-1"
        }
      >
        <div ref={mapEl} className="h-full w-full bg-sea-soft" />

        {KAKAO_KEY ? (
          <button
            onClick={() => setAreaOnly((v) => !v)}
            className={"absolute right-4 top-4 z-10 rounded-pill px-4 py-2 text-sm shadow-md " + (areaOnly ? "bg-tangerine text-paper" : "bg-paper")}
          >
            {areaOnly ? "전체 보기" : "이 영역만"}
          </button>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted">
            지도 키(NEXT_PUBLIC_KAKAO_JS_KEY) 미설정 또는 도메인 미등록
          </div>
        )}

        {/* 모바일: 지도 닫기 */}
        <button onClick={() => setMapOpen(false)} className="absolute left-4 top-4 z-10 rounded-pill bg-basalt px-4 py-2 text-sm text-paper shadow-md lg:hidden">
          ← 목록
        </button>

        {/* 핀 미니카드 */}
        {selected && (
          <div className="absolute inset-x-4 bottom-4 z-10 mx-auto max-w-md rounded-card bg-paper p-3 shadow-xl">
            <div className="flex gap-3">
              <img src={selected.thumbnailUrl} alt="" className="aspect-video w-32 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <div className="num text-lg font-bold text-basalt">{selected.priceManwon.toLocaleString()}만</div>
                <div className="text-sm text-muted">{selected.region} · {selected.propertyType} · {selected.dealType}</div>
                <div className="mt-1 line-clamp-2 text-xs text-stone">{selected.summary}</div>
                <Link href={`/listing/${selected.id}`} className="mt-2 inline-block rounded-pill bg-sea px-3 py-1 text-xs text-paper">상세</Link>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 모바일: 지도 열기 */}
      {!mapOpen && (
        <button onClick={openMap} className="fixed bottom-5 right-5 z-20 rounded-pill bg-basalt px-5 py-3 text-sm font-medium text-paper shadow-lg lg:hidden">
          지도 보기
        </button>
      )}
    </div>
  );
}
