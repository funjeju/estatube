// lib/auth-server.ts — 서버측 인증/인가. API 라우트에서 Firebase ID 토큰 검증 + role 게이트.
import { adminAuth } from "./firebase/admin";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Staff {
  uid: string;
  role: "editor" | "superadmin";
  email?: string;
}

/** Authorization: Bearer <idToken> 검증 후 staff(editor/superadmin)만 통과. 아니면 HttpError. */
export async function requireStaff(req: Request): Promise<Staff> {
  const authz = req.headers.get("authorization") ?? "";
  const m = authz.match(/^Bearer (.+)$/);
  if (!m || !m[1]) throw new HttpError(401, "인증 토큰이 없습니다");

  const decoded = await adminAuth.verifyIdToken(m[1]).catch(() => null);
  if (!decoded) throw new HttpError(401, "토큰 검증 실패(만료/위조)");

  const role = decoded.role;
  if (role !== "editor" && role !== "superadmin") {
    throw new HttpError(403, `접근 권한이 없습니다 (role=${role ?? "viewer"})`);
  }
  return { uid: decoded.uid, role, email: decoded.email };
}
