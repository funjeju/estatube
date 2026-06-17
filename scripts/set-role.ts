// scripts/set-role.ts — 사용자에게 custom claims role 부여 (운영자 도구).
// 대상 사용자는 먼저 1회 Google 로그인해 Firebase Auth에 존재해야 한다.
//
//   pnpm set-role someone@gmail.com editor
//   pnpm set-role someone@gmail.com superadmin | viewer
//
// 부여 후 해당 사용자는 재로그인(또는 토큰 갱신) 시 role 클레임이 반영된다.

import { loadLocalEnv } from "../lib/env.js";

loadLocalEnv();

const ROLES = ["superadmin", "editor", "viewer"] as const;
type Role = (typeof ROLES)[number];

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const email = args[0];
  const role = args[1] as Role | undefined;

  if (!email || !role || !ROLES.includes(role)) {
    console.error(
      `사용법: pnpm set-role <email> <${ROLES.join("|")}>\n예) pnpm set-role me@gmail.com editor`,
    );
    process.exit(1);
  }

  // admin SDK는 실제 프로젝트 자격증명 필요(에뮬레이터 분기 방지)
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.error("⚠ 에뮬레이터 env가 설정돼 있습니다. 실제 사용자에 부여하려면 해제 후 실행하세요.");
  }

  const { adminAuth } = await import("../lib/firebase/admin.js");
  const user = await adminAuth.getUserByEmail(email);
  await adminAuth.setCustomUserClaims(user.uid, { role });
  console.error(`✅ ${email} (uid ${user.uid}) → role=${role}. 해당 사용자 재로그인 시 반영됩니다.`);
}

main().catch((e) => {
  console.error("set-role 실패:", String(e).slice(0, 200));
  process.exit(1);
});
