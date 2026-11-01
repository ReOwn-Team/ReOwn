"use client";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { authSession, type AuthSnapshot } from "./session";
// Keep the request's snapshot stable across independently hydrated boundaries.
// Each consumer subscribes itself so its first render still matches its HTML.
const Context = createContext<AuthSnapshot | null>(null);
export function AuthProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: AuthSnapshot;
}) {
  useEffect(() => {
    void authSession.start(initial);
  }, [initial]);
  return (
    <Context.Provider value={initial ?? authSession.getServerSnapshot()}>
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const initial = useContext(Context);
  const state = useSyncExternalStore(
    authSession.subscribe,
    () => authSession.getSnapshot(initial ?? undefined),
    () => initial ?? authSession.getServerSnapshot(),
  );
  if (!initial) throw new Error("useAuth requires AuthProvider");
  return state;
}
