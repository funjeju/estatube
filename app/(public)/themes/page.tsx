import Link from "next/link";
import { THEMES } from "@/lib/types";

const DESC: Record<string, string> = {
  세컨하우스: "별장·주말주택, 가끔 머무는 집",
  한달살기: "단기 체류·임대수익형",
  구옥: "옛집·돌집 리모델링 감성",
  바다뷰: "오션뷰·해변·조망",
  읍면단독: "읍·면 단독·전원주택",
  급매: "가격인하·초급매",
};

export const metadata = { title: "테마 컬렉션 — 탐라인덱스" };

export default function ThemesLanding() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold">테마 컬렉션</Link>
        <Link href="/search" className="rounded-pill border border-stone px-3 py-1 text-sm text-muted">검색</Link>
      </div>
      <p className="mt-1 text-sm text-muted">원하는 라이프스타일로 모아 보기</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {THEMES.map((t) => (
          <Link key={t} href={`/themes/${encodeURIComponent(t)}`} className="rounded-card border border-stone/50 p-4 transition hover:bg-sea-soft">
            <div className="text-lg font-bold">{t}</div>
            <div className="mt-1 text-sm text-muted">{DESC[t]}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
