"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth-provider";
import type { Agent } from "@/lib/types";

const BLANK = { channelId: "", channelName: "", channelUrl: "", regNo: "", office: "", phone: "", verified: false, plan: "free" as Agent["plan"] };

export default function AgentsAdmin() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState({ ...BLANK });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(
    () => onSnapshot(collection(db, "agents"), (s) => setAgents(s.docs.map((d) => d.data() as Agent))),
    [],
  );

  const save = async (patch: Record<string, unknown>) => {
    if (!user) return;
    setMsg(null);
    const idToken = await user.getIdToken();
    const res = await fetch("/api/admin/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(patch),
    });
    const j = await res.json();
    setMsg(res.ok ? `저장됨: ${j.channelId}${j.created ? " (신규)" : ""}` : `오류: ${j.error}`);
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold">중개사 관리</h1>
      <p className="mt-1 text-sm text-muted">
        verified·등록번호(regNo)는 게시 게이트의 조건입니다. 채널 단위 옵트아웃도 여기서.
      </p>

      {/* 등록/수정 폼 */}
      <section className="mt-5 rounded-card border border-stone/50 p-4">
        <h2 className="font-medium">채널 등록 / 수정</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <input placeholder="channelId (필수)" value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })} className="rounded border border-stone px-2 py-1" />
          <input placeholder="채널명" value={form.channelName} onChange={(e) => setForm({ ...form, channelName: e.target.value })} className="rounded border border-stone px-2 py-1" />
          <input placeholder="채널 URL" value={form.channelUrl} onChange={(e) => setForm({ ...form, channelUrl: e.target.value })} className="rounded border border-stone px-2 py-1" />
          <input placeholder="등록번호 regNo" value={form.regNo} onChange={(e) => setForm({ ...form, regNo: e.target.value })} className="rounded border border-stone px-2 py-1" />
          <input placeholder="상호(office)" value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} className="rounded border border-stone px-2 py-1" />
          <input placeholder="연락처" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded border border-stone px-2 py-1" />
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={form.verified} onChange={(e) => setForm({ ...form, verified: e.target.checked })} /> verified
          </label>
          <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as Agent["plan"] })} className="rounded border border-stone px-2 py-1">
            <option value="free">free</option><option value="featured">featured</option><option value="premium">premium</option>
          </select>
          <button onClick={() => { if (form.channelId) save(form); }} className="rounded-pill bg-sea px-4 py-1.5 text-paper">저장</button>
        </div>
      </section>

      {msg && <p className="mt-4 rounded-card bg-sea-soft px-4 py-2 text-sm text-sea">{msg}</p>}

      {/* 목록 */}
      <table className="mt-5 w-full text-left text-sm">
        <thead className="text-muted">
          <tr><th className="py-2">채널</th><th>regNo</th><th>verified</th><th>plan</th><th>옵트아웃</th></tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.channelId} className="border-t border-stone/40">
              <td className="py-2">
                <div className="font-medium">{a.channelName || a.channelId}</div>
                <div className="num text-xs text-stone">{a.channelId}</div>
              </td>
              <td className="num">{a.regNo || "—"}</td>
              <td>
                <button onClick={() => save({ channelId: a.channelId, verified: !a.verified })}
                  className={"rounded-pill px-2 py-0.5 text-xs " + (a.verified ? "bg-sea text-paper" : "border border-stone text-muted")}>
                  {a.verified ? "verified" : "미검증"}
                </button>
              </td>
              <td>{a.plan}</td>
              <td>
                <button onClick={() => save({ channelId: a.channelId, optedOut: !a.optedOut })}
                  className={"rounded-pill px-2 py-0.5 text-xs " + (a.optedOut ? "bg-tangerine text-paper" : "border border-stone text-muted")}>
                  {a.optedOut ? "옵트아웃" : "활성"}
                </button>
              </td>
            </tr>
          ))}
          {agents.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">등록된 중개사 없음</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
