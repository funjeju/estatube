"use client";

import type { ReactNode } from "react";
import { useAuth, isStaff } from "@/components/auth-provider";
import { AuthStatus } from "@/components/auth-status";

// 어드민 가드: editor/superadmin 만 접근. 비로그인·viewer 차단.
// 실제 보안은 Firestore 규칙(staff())이 서버에서 강제 — 이건 UX 게이트.
function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, role, loading, signInGoogle } = useAuth();

  if (loading) {
    return <Centered>확인 중…</Centered>;
  }
  if (!user) {
    return (
      <Centered>
        <h1 className="text-xl font-bold">어드민 — 로그인 필요</h1>
        <p className="text-muted">운영 콘솔은 로그인한 운영자만 접근할 수 있습니다.</p>
        <button
          type="button"
          onClick={signInGoogle}
          className="rounded-pill bg-sea px-5 py-2 font-medium text-paper"
        >
          Google 로그인
        </button>
      </Centered>
    );
  }
  if (!isStaff(role)) {
    return (
      <Centered>
        <h1 className="text-xl font-bold">접근 권한 없음</h1>
        <p className="text-muted">
          editor 이상의 권한이 필요합니다. 현재 역할:{" "}
          <span className="num">{role ?? "none"}</span>
        </p>
        <p className="text-sm text-stone">
          운영자에게 권한 요청: <code className="num">pnpm set-role {user.email} editor</code>
        </p>
        <AuthStatus />
      </Centered>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-stone/40 px-6 py-3">
        <span className="font-bold">탐라인덱스 · 어드민</span>
        <AuthStatus />
      </header>
      {children}
    </div>
  );
}
