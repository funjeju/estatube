"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Listing } from "@/lib/types";

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

// 카카오 SDK 전역 (간이 타입)
/* eslint-disable @next/next/no-img-element */
type Kakao = any;
declare global {
  interface Window {
    kakao: Kakao;
  }
}

export default function MapHome() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapObj = useRef<Kakao>(null);
  const clusterer = useRef<Kakao>(null);
  const [ready, setReady] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [areaOnly, setAreaOnly] = useState(false);

  // 1) SDK 로드 + 지도 초기화
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

  // 2) published 매물 구독
  useEffect(
    () =>
      onSnapshot(query(collection(db, "listings"), where("status", "==", "published")), (snap) =>
        setListings(snap.docs.map((d) => d.data() as Listing)),
      ),
    [],
  );

  // 3) 마커 렌더 (영역 필터 옵션)
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

  if (!KAKAO_KEY) {
    return (
      <main className="flex h-dvh items-center justify-center px-6 text-center text-muted">
        NEXT_PUBLIC_KAKAO_JS_KEY 가 설정되지 않아 지도를 표시할 수 없습니다.
      </main>
    );
  }

  return (
    <div className="relative h-dvh w-full">
      <div ref={mapEl} className="h-full w-full bg-sea-soft" />

      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-pill bg-paper/95 px-4 py-2 shadow-md">
        <span className="font-bold">탐라인덱스</span>
        <span className="num text-sm text-muted">{listings.length} 매물</span>
        <Link href="/search" className="rounded-pill bg-sea px-3 py-1 text-sm text-paper">검색</Link>
        <Link href="/my" className="text-sm text-muted">마이</Link>
      </div>

      <button
        onClick={() => setAreaOnly((v) => !v)}
        className={"absolute right-4 top-4 z-10 rounded-pill px-4 py-2 text-sm shadow-md " + (areaOnly ? "bg-tangerine text-paper" : "bg-paper")}
      >
        {areaOnly ? "전체 보기" : "이 영역만"}
      </button>

      {selected && (
        <div className="absolute inset-x-4 bottom-4 z-10 mx-auto max-w-md rounded-card bg-paper p-3 shadow-xl">
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.thumbnailUrl} alt="" className="aspect-video w-32 shrink-0 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <div className="num text-lg font-bold text-basalt">{selected.priceManwon.toLocaleString()}만</div>
              <div className="text-sm text-muted">{selected.region} · {selected.propertyType} · {selected.dealType}</div>
              <div className="mt-1 truncate text-xs text-stone">{selected.summary}</div>
              <div className="mt-2 flex gap-2">
                <Link href={`/listing/${selected.id}`} className="rounded-pill bg-sea px-3 py-1 text-xs text-paper">상세</Link>
                <button onClick={() => setSelected(null)} className="rounded-pill border border-stone px-3 py-1 text-xs text-muted">닫기</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
