"use client";

import { useAuth } from "@/components/auth-provider";

// 로그인 상태 + Google 로그인/로그아웃 버튼 (헤더용 소형 컴포넌트)
export function AuthStatus() {
  const { user, role, loading, signInGoogle, logout } = useAuth();

  if (loading) {
    return <span className="text-sm text-muted">확인 중…</span>;
  }
  if (!user) {
    return (
      <button
        type="button"
        onClick={signInGoogle}
        className="rounded-pill bg-sea px-4 py-1.5 text-sm font-medium text-paper transition hover:opacity-90"
      >
        Google 로그인
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted">
        {user.displayName ?? user.email}
        {role && role !== "viewer" && (
          <span className="ml-1 rounded-pill bg-basalt px-2 py-0.5 text-xs text-paper">
            {role}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={logout}
        className="rounded-pill border border-stone px-3 py-1.5 text-muted transition hover:bg-sea-soft"
      >
        로그아웃
      </button>
    </div>
  );
}
