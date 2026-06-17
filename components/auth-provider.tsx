"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export type Role = "superadmin" | "editor" | "viewer" | null;

interface AuthState {
  user: User | null;
  role: Role;
  loading: boolean;
  signInGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function isStaff(role: Role): boolean {
  return role === "editor" || role === "superadmin";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // custom claims role (admin SDK로 부여). 미설정 시 viewer.
        const token = await u.getIdTokenResult();
        const claimRole = token.claims.role;
        setRole(
          claimRole === "superadmin" || claimRole === "editor" || claimRole === "viewer"
            ? claimRole
            : "viewer",
        );
      } else {
        setRole(null);
      }
      setLoading(false);
    });
  }, []);

  const signInGoogle = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  };
  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthCtx.Provider value={{ user, role, loading, signInGoogle, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth는 AuthProvider 내부에서만 사용");
  return ctx;
}
