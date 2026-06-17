import Link from "next/link";

// 어드민 진입점. 가드는 app/admin/layout.tsx(editor+).
export default function AdminHome() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center gap-6 px-6">
      <div>
        <span className="rounded-pill bg-basalt px-3 py-1 text-sm font-medium text-paper">
          어드민
        </span>
        <h1 className="mt-3 text-3xl font-bold">운영 콘솔</h1>
      </div>
      <nav className="flex flex-wrap gap-3">
        <Link
          href="/admin/collect"
          className="rounded-card border border-stone px-4 py-3 transition hover:bg-sea-soft"
        >
          <span className="font-medium">수집 콘솔</span>
          <span className="block text-sm text-muted">기간·지역 수집 → draft</span>
        </Link>
        <Link
          href="/admin/review"
          className="rounded-card border border-stone px-4 py-3 transition hover:bg-sea-soft"
        >
          <span className="font-medium">검수 큐</span>
          <span className="block text-sm text-muted">인라인 수정 → 승인·게시</span>
        </Link>
        <Link href="/admin/published" className="rounded-card border border-stone px-4 py-3 transition hover:bg-sea-soft">
          <span className="font-medium">게시 관리</span>
          <span className="block text-sm text-muted">옵트아웃 takedown</span>
        </Link>
        <Link href="/admin/agents" className="rounded-card border border-stone px-4 py-3 transition hover:bg-sea-soft">
          <span className="font-medium">중개사 관리</span>
          <span className="block text-sm text-muted">verified·등록번호</span>
        </Link>
      </nav>
    </main>
  );
}
