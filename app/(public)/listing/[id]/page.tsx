"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth-provider";
import type { Agent, Listing } from "@/lib/types";

type Kakao = any;
declare global {
  interface Window {
    kakao: Kakao;
  }
}

export default function ListingDetail() {
  const params = useParams();
  const id = String(params.id ?? "");
  const { user, signInGoogle } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "private">("loading");
  const [fav, setFav] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const snap = await getDoc(doc(db, "listings", id));
      if (!snap.exists() || snap.get("status") !== "published") {
        setState("private");
        return;
      }
      const l = snap.data() as Listing;
      setListing(l);
      setState("ok");
      if (l.channelId) {
        const a = await getDoc(doc(db, "agents", l.channelId));
        if (a.exists()) setAgent(a.data() as Agent);
      }
    })();
  }, [id]);

  // 찜 상태
  useEffect(() => {
    if (!user || !id) return setFav(false);
    getDoc(doc(db, "favorites", `${user.uid}_${id}`)).then((s) => setFav(s.exists()));
  }, [user, id]);

  const toggleFav = async () => {
    if (!user) return signInGoogle();
    const ref = doc(db, "favorites", `${user.uid}_${id}`);
    if (fav) {
      await deleteDoc(ref);
      setFav(false);
    } else {
      await setDoc(ref, { id: `${user.uid}_${id}`, userId: user.uid, listingId: id, notifyPriceDrop: true, savedAt: Date.now() });
      setFav(true);
    }
  };

  // 지도
  useEffect(() => {
    if (state !== "ok" || !listing?.lat || !listing?.lng) return;
    const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!key) return;
    const init = () => {
      const kakao = window.kakao;
      const center = new kakao.maps.LatLng(listing.lat, listing.lng);
      const map = new kakao.maps.Map(mapEl.current, { center, level: 4 });
      new kakao.maps.Marker({ position: center, map });
    };
    if (window.kakao?.maps) { window.kakao.maps.load(init); return; }
    const s = document.createElement("script");
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    s.async = true;
    s.onload = () => window.kakao.maps.load(init);
    document.head.appendChild(s);
  }, [state, listing]);

  if (state === "loading") return <main className="flex h-dvh items-center justify-center text-muted">불러오는 중…</main>;
  if (state === "private" || !listing)
    return (
      <main className="mx-auto flex h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-bold">비공개 매물</h1>
        <p className="text-muted">존재하지 않거나 공개되지 않은 매물입니다.</p>
        <Link href="/" className="rounded-pill bg-sea px-4 py-2 text-paper">지도로</Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-bold">탐라인덱스</Link>
        <div className="flex gap-2">
          <button onClick={toggleFav} className={"rounded-pill px-4 py-1.5 text-sm " + (fav ? "bg-tangerine text-paper" : "border border-stone text-muted")}>
            {fav ? "♥ 찜됨" : "♡ 찜"}
          </button>
        </div>
      </div>

      {/* 임베드 (다운로드·재호스팅 금지: iframe 임베드만) */}
      <div className="mt-4 aspect-video w-full overflow-hidden rounded-card bg-basalt">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${listing.videoId}`}
          title="매물 영상"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      <div className="num mt-4 text-3xl font-bold">{listing.priceManwon.toLocaleString()}만원</div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-sm">
        <span className="rounded-pill bg-sea-soft px-2 py-0.5 text-sea">{listing.propertyType}</span>
        <span className="rounded-pill bg-sea-soft px-2 py-0.5 text-sea">{listing.dealType}</span>
        {listing.zoning && <span className="rounded-pill border border-stone px-2 py-0.5 text-muted">{listing.zoning}</span>}
        {listing.geoNeedsReview && <span className="rounded-pill bg-tangerine/15 px-2 py-0.5 text-tangerine">위치 추정</span>}
      </div>
      <div className="num mt-2 text-tangerine">{listing.region}{listing.areaPyeong ? ` · ${listing.areaPyeong}평` : ""}{listing.addressText ? ` · ${listing.addressText}` : ""}</div>

      <p className="mt-4 whitespace-pre-line text-basalt">{listing.summary}</p>
      {listing.highlights?.length > 0 && (
        <ul className="mt-3 list-inside list-disc text-sm text-muted">
          {listing.highlights.map((h, i) => <li key={i}>{h}</li>)}
        </ul>
      )}
      {listing.keywords?.length > 0 && (
        <div className="mt-3 text-sm text-stone">{listing.keywords.map((k) => `#${k}`).join(" ")}</div>
      )}

      {/* 지도 */}
      <div ref={mapEl} className="mt-5 aspect-[2/1] w-full rounded-card bg-sea-soft" />

      {/* 중개사 소개 */}
      <section className="mt-5 rounded-card border border-stone/50 p-4">
        <h2 className="flex items-center gap-2 font-medium">
          중개사
          {agent?.verified && <span className="rounded-pill bg-sea px-2 py-0.5 text-xs text-paper">verified</span>}
        </h2>
        {agent ? (
          <div className="mt-2 text-sm text-muted">
            <div className="font-medium text-basalt">{agent.office || agent.channelName || agent.name || "—"}</div>
            {agent.regNo && <div className="num">등록 {agent.regNo}</div>}
            {agent.phone && <div className="num">{agent.phone}</div>}
            {agent.channelUrl && <a href={agent.channelUrl} target="_blank" rel="noreferrer" className="text-sea underline">채널 보기</a>}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">중개사 정보 준비 중</p>
        )}
      </section>

      {/* 원격 임장 CTA */}
      <button
        onClick={() => alert("원격 임장 예약은 준비 중입니다.")}
        className="mt-4 w-full rounded-card bg-sea py-3 font-medium text-paper"
      >
        원격 임장 예약
      </button>
    </main>
  );
}
