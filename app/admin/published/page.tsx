"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth-provider";
import type { Listing } from "@/lib/types";

export default function PublishedAdmin() {
  const { user } = useAuth();
  const [items, setItems] = useState<Listing[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(query(collection(db, "listings"), where("status", "==", "published")), (s) =>
        setItems(s.docs.map((d) => d.data() as Listing)),
      ),
    [],
  );

  const takedown = async (videoId: string, channelId: string, scope: "video" | "channel") => {
    if (!user) return;
    if (!confirm(scope === "channel" ? "채널 전체를 옵트아웃(takedown)합니다." : "이 매물을 옵트아웃합니다.")) return;
    const idToken = await user.getIdToken();
    const res = await fetch("/api/admin/takedown", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ videoId, channelId, scope }),
    });
    const j = await res.json();
    setMsg(res.ok ? `옵트아웃 완료 (${scope})` : `오류: ${j.error}`);
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold">게시 관리</h1>
      <p className="mt-1 text-sm text-muted">{items.length}건 게시 중 · 옵트아웃 시 즉시 비공개 + 재수집 제외</p>
      {msg && <p className="mt-4 rounded-card bg-sea-soft px-4 py-2 text-sm text-sea">{msg}</p>}
      <div className="mt-5 space-y-2">
        {items.map((l) => (
          <div key={l.id} className="flex items-center gap-3 rounded-card border border-stone/50 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="num font-medium">{l.priceManwon.toLocaleString()}만 · {l.region}</div>
              <div className="truncate text-xs text-muted">{l.summary}</div>
            </div>
            <button onClick={() => takedown(l.videoId, l.channelId, "video")} className="rounded-pill border border-tangerine px-3 py-1 text-tangerine">영상 옵트아웃</button>
            <button onClick={() => takedown(l.videoId, l.channelId, "channel")} className="rounded-pill border border-stone px-3 py-1 text-muted">채널 전체</button>
          </div>
        ))}
        {items.length === 0 && <p className="rounded-card border border-dashed border-stone px-4 py-10 text-center text-muted">게시된 매물 없음</p>}
      </div>
    </main>
  );
}
