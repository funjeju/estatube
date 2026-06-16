export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center gap-6 px-6">
      <span className="rounded-pill bg-sea-soft px-3 py-1 text-sm font-medium text-sea">
        Phase 1 · MVP 구축 중
      </span>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        탐라인덱스
      </h1>
      <p className="max-w-xl text-lg text-muted">
        제주의 흩어진 유튜브 매물 영상을 표준 색인으로. 지도 한 장과 직관적
        검색으로 일원화합니다.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-card border border-stone px-3 py-1.5 text-muted">
          지도 홈 <span className="text-stone">(T10)</span>
        </span>
        <span className="rounded-card border border-stone px-3 py-1.5 text-muted">
          검색·필터 <span className="text-stone">(T11)</span>
        </span>
        <span className="num rounded-card bg-basalt px-3 py-1.5 text-paper">
          accuracy 90.8%
        </span>
      </div>
    </main>
  );
}
