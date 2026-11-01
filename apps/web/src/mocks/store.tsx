"use client";
import { listProducts } from "@/lib/products/client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  emptyDraft,
  initialAddresses,
  initialListings,
  initialOrders,
  initialSales,
  products,
  type Address,
  type Listing,
  type ListingDraft,
  type MockOrder,
  type Product,
} from "./data";
import { useAuth } from "@/lib/auth/provider";
import { authSession } from "@/lib/auth/session";
import type { UserProfile } from "@reown/api-contract";
type AppUser = UserProfile & { name: string };
const appUser = (user: UserProfile | null): AppUser | null =>
  user ? { ...user, name: user.displayName } : null;
import { readDemo, writeDemo, type DemoState } from "./persistence";

function seed(): DemoState {
  return structuredClone({
    saved: ["laptop", "headphones", "books"],
    viewed: [],
    addresses: initialAddresses,
    orders: initialOrders,
    listings: initialListings,
    sales: initialSales,
    draft: emptyDraft,
    editDrafts: {},
  });
}
type Setter<T> = Dispatch<SetStateAction<T>>;
type MockStore = DemoState & {
  ready: boolean;
  persistenceError: string;
  catalog: Product[];
  user: AppUser | null;
  setAddresses: Setter<Address[]>;
  setOrders: Setter<MockOrder[]>;
  setListings: Setter<Listing[]>;
  setSales: Setter<MockOrder[]>;
  setDraft: Setter<ListingDraft>;
  setEditDrafts: Setter<Record<string, ListingDraft>>;
  toggleSaved: (id: string) => void;
  markViewed: (id: string) => void;
  notice: string;
  notify: (message: string) => void;
  authOpen: boolean;
  setAuthOpen: (open: boolean) => void;
  requireAuth: (action: (user: AppUser) => void) => void;
  finishAuth: () => void;
  resetDemo: () => Promise<void>;
  flush: () => Promise<void>;
};
const Context = createContext<MockStore | null>(null);
export function MockProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const user = appUser(auth.user);
  const [publicListings, setPublicListings] = useState<Listing[]>([]);
  useEffect(() => {
    let active = true;
    function refresh() {
      void listProducts()
        .then((items) => {
          if (active) setPublicListings(items);
        })
        .catch(() => {});
    }
    refresh();
    window.addEventListener("reown-products-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("reown-products-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const [state, setState] = useState<DemoState>(seed);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [persistenceError, setPersistenceError] = useState("");
  const [authOpen, setAuthOpenState] = useState(false);
  const pending = useRef<((user: AppUser) => void) | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef(state);
  useEffect(() => {
    let active = true;
    readDemo()
      .then((saved) => {
        if (active && saved) setState({ ...seed(), ...saved });
      })
      .catch(() => {
        if (active)
          setPersistenceError(
            "Không thể mở bộ nhớ demo. Thay đổi sẽ chỉ giữ trong phiên này.",
          );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    latest.current = state;
    if (!ready) return;
    queue.current = queue.current
      .catch(() => {})
      .then(() => writeDemo(state))
      .catch(() =>
        setPersistenceError(
          "Không thể lưu thay đổi trên thiết bị. Hãy thử đặt lại dữ liệu demo.",
        ),
      );
  }, [state, ready]);
  const notify = useCallback((message: string) => setNotice(message), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  function setter<K extends keyof DemoState>(key: K): Setter<DemoState[K]> {
    return (value) =>
      setState((current) => ({
        ...current,
        [key]:
          typeof value === "function"
            ? (value as (previous: DemoState[K]) => DemoState[K])(current[key])
            : value,
      }));
  }
  const markViewed = useCallback(
    (id: string) =>
      setState((current) =>
        current.viewed[0] === id
          ? current
          : {
              ...current,
              viewed: [
                id,
                ...current.viewed.filter((value) => value !== id),
              ].slice(0, 50),
            },
      ),
    [],
  );
  function requireAuth(action: (user: AppUser) => void) {
    const continueAction = () => {
      const currentUser = appUser(authSession.getSnapshot().user);
      if (currentUser) action(currentUser);
      else {
        pending.current = action;
        setAuthOpenState(true);
      }
    };
    if (authSession.getSnapshot().status === "checking") {
      notify("Đang khôi phục phiên…");
      void authSession.start().then(continueAction);
    } else continueAction();
  }
  function setAuthOpen(open: boolean) {
    if (!open) pending.current = null;
    setAuthOpenState(open);
  }
  function finishAuth() {
    const currentUser = appUser(authSession.getSnapshot().user);
    if (!currentUser) return;
    setAuthOpenState(false);
    const action = pending.current;
    pending.current = null;
    action?.(currentUser);
    notify("Đã đăng nhập.");
  }
  function toggleSaved(id: string) {
    const action = () => {
      setState((current) => ({
        ...current,
        saved: current.saved.includes(id)
          ? current.saved.filter((value) => value !== id)
          : [...current.saved, id],
      }));
      notify(
        state.saved.includes(id) ? "Đã bỏ lưu sản phẩm." : "Đã lưu sản phẩm.",
      );
    };
    requireAuth(action);
  }
  async function resetDemo() {
    pending.current = null;
    setAuthOpenState(false);
    const initial = seed();
    setState(initial);
    await queue.current;
    await writeDemo(initial);
    setPersistenceError("");
    notify("Đã đặt lại dữ liệu demo.");
  }
  const completed = new Set(
    state.orders
      .filter((order) => order.status === "Hoàn tất" && order.product)
      .map((order) => order.productId),
  );
  const catalog = [
    ...publicListings,
    ...products,
    ...state.listings
      .filter((item) => item.status !== "Đã ẩn")
      .map((item) => ({ ...item, sold: item.status === "Đã bán" })),
  ].map((item) => (completed.has(item.id) ? { ...item, sold: true } : item));
  return (
    <Context.Provider
      value={{
        ...state,
        catalog,
        ready,
        persistenceError,
        user,
        setAddresses: setter("addresses"),
        setOrders: setter("orders"),
        setListings: setter("listings"),
        setSales: setter("sales"),
        setDraft: setter("draft"),
        setEditDrafts: setter("editDrafts"),
        toggleSaved,
        markViewed,
        notify,
        notice,
        authOpen,
        setAuthOpen,
        requireAuth,
        finishAuth,
        resetDemo,
        flush: async () => {
          await queue.current;
          await writeDemo(latest.current);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useMock() {
  const value = useContext(Context);
  if (!value) throw new Error("useMock requires MockProvider");
  return value;
}
