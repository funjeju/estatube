"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ListingCard } from "@/components/listing-card";
import { THEMES, type Listing, type Theme } from "@/lib/types";

export default function ThemeCollection() {
  const params = useParams();
  const theme = decodeURIComponent(String(params.theme ?? "")) as Theme;
  const valid = (THEMES as string[]).includes(theme);
  const [items, setItems] = useState<Listing[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!valid) return;
    (async () => {
      try {
        const q = query(
          collection(db, "listings"),
          where("status", "==", "published"),
          where("themes", "array-contains", theme),
          orderBy("publishedAt", "desc"),
          limit(48),
        );
        const snap = await getDocs(q);
        setItems(snap.docs.map((d) => d.data() as Listing));
        setState("ok");
      } catch (e) {
        setErr(String(e instanceof Error ? e.message : e));
        setState("error");
      }
    })();
  }, [theme, valid]);

  if (!valid)
    return (
      <main className="mx-auto flex h-dvh max-w-md flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-xl font-bold">없는 테마</h1>
        <Link href="/themes" className="rounded-pill bg-sea px-4 py-2 text-paper">테마 목록</Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between">
        <Link href="/themes" className="text-sm text-muted">← 테마</Link>
        <Link href="/" className="font-bold">탐라인덱스</Link>
      </div>
      <h1 className="mt-2 text-2xl font-bold">{theme}</h1>

      {state === "error" && <p className="mt-4 rounded-card bg-tangerine/10 px-4 py-2 text-sm text-tangerine">불러오기 실패: {err}</p>}
      {state === "loading" && <p className="mt-6 text-muted">불러오는 중…</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((l) => <ListingCard key={l.id} listing={l} />)}
      </div>
      {state === "ok" && items.length === 0 && (
        <p className="mt-10 text-center text-muted">아직 “{theme}” 매물이 없습니다. 다른 테마를 둘러보세요.</p>
      )}
    </main>
  );
}
