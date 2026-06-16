// lib/firebase/admin.ts — 서버 전용 Firebase Admin SDK. 절대 클라이언트 번들에 포함 금지.
import {
  getApps,
  initializeApp,
  cert,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function createApp(): App {
  // 에뮬레이터(FIRESTORE_EMULATOR_HOST 등)면 자격증명 없이 기동 가능
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({
      projectId:
        process.env.FIREBASE_ADMIN_PROJECT_ID ??
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
        "demo-tamna",
    });
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // .env 한 줄 저장 시 \n 이스케이프 → 실제 줄바꿈 복원
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin env 미설정(FIREBASE_ADMIN_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY)");
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const app: App = getApps().length ? getApps()[0]! : createApp();

export const adminAuth: Auth = getAuth(app);
export const adminDb: Firestore = getFirestore(app);
