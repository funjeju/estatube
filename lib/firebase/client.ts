// lib/firebase/client.ts — 클라이언트 Firebase SDK (브라우저). NEXT_PUBLIC_* 만 사용.
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(firebaseApp);
export const db: Firestore = getFirestore(firebaseApp);

// dev: 에뮬레이터 연결 (NEXT_PUBLIC_FIREBASE_EMULATOR=true). 1회만.
declare global {
  // eslint-disable-next-line no-var
  var __FB_EMU__: boolean | undefined;
}
if (
  process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "true" &&
  typeof window !== "undefined" &&
  !globalThis.__FB_EMU__
) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  globalThis.__FB_EMU__ = true;
}
