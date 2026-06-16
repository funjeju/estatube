// 어드민 진입점 (가드는 T3 인증에서 추가). 지금은 플레이스홀더.
export default function AdminHome() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center gap-4 px-6">
      <span className="rounded-pill bg-basalt px-3 py-1 text-sm font-medium text-paper">
        어드민
      </span>
      <h1 className="text-3xl font-bold">운영 콘솔</h1>
      <p className="text-muted">
        수집 콘솔(T7) · 검수 큐(T8) · 게시/중개사 관리(T9)는 이후 태스크에서
        구현됩니다.
      </p>
    </main>
  );
}
