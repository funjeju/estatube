"use client";

import { useAuth } from "@/components/auth-provider";
import { AuthStatus } from "@/components/auth-status";

// 마이: 비로그인 차단. 저장검색·찜·알림은 T13에서 구현.
export default function MyPage() {
  const { user, loading, signInGoogle } = useAuth();

  if (loading) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center text-muted">
        확인 중…
      </main>
    );
  }
  if (!user) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-bold">로그인이 필요합니다</h1>
        <p className="text-muted">저장검색·찜·알림을 보려면 로그인하세요.</p>
        <button
          type="button"
          onClick={signInGoogle}
          className="rounded-pill bg-sea px-5 py-2 font-medium text-paper"
        >
          Google 로그인
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">마이</h1>
        <AuthStatus />
      </header>
      <p className="text-muted">
        저장검색 + 알림주기, 찜 가격추적, 알림함은 T13에서 구현됩니다.
      </p>
    </main>
  );
}
