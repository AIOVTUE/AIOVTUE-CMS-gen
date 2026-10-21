"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

type RepoHeaderSlots = {
  header: ReactNode | null;
};

type RepoHeaderStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RepoHeaderSlots;
  setSlots: (next: Partial<RepoHeaderSlots>, ownerId: number) => void;
  clearSlots: (ownerId: number) => void;
};

type RepoHeaderApi = {
  setSlots: (next: Partial<RepoHeaderSlots>, ownerId: number) => void;
  clearSlots: (ownerId: number) => void;
};

const RepoHeaderApiContext = createContext<RepoHeaderApi | null>(null);
const RepoHeaderStoreContext = createContext<RepoHeaderStore | null>(null);

let nextHeaderOwnerId = 1;

function createRepoHeaderStore(): RepoHeaderStore {
  let slots: RepoHeaderSlots = { header: null };
  let ownerId: number | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return slots;
    },
    setSlots(next, nextOwnerId) {
      ownerId = nextOwnerId;
      const merged = { ...slots, ...next };
      if (slots.header === merged.header) return;
      slots = merged;
      emit();
    },
    clearSlots(requestOwnerId) {
      // Ignore stale unmounts from the previous page after the next page already registered.
      if (ownerId !== requestOwnerId) return;
      ownerId = null;
      if (slots.header == null) return;
      slots = { header: null };
      emit();
    },
  };
}

export function RepoHeaderProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<RepoHeaderStore | null>(null);
  if (storeRef.current == null) {
    storeRef.current = createRepoHeaderStore();
  }
  const store = storeRef.current;

  const setSlots = useCallback(
    (next: Partial<RepoHeaderSlots>, ownerId: number) => {
      store.setSlots(next, ownerId);
    },
    [store],
  );

  const clearSlots = useCallback(
    (ownerId: number) => {
      store.clearSlots(ownerId);
    },
    [store],
  );

  const apiRef = useRef<RepoHeaderApi>({ setSlots, clearSlots });
  apiRef.current.setSlots = setSlots;
  apiRef.current.clearSlots = clearSlots;

  return (
    <RepoHeaderStoreContext.Provider value={store}>
      <RepoHeaderApiContext.Provider value={apiRef.current}>
        {children}
      </RepoHeaderApiContext.Provider>
    </RepoHeaderStoreContext.Provider>
  );
}

export function useRepoHeaderState() {
  const store = useContext(RepoHeaderStoreContext);
  if (!store) {
    throw new Error("useRepoHeaderState must be used within a RepoHeaderProvider");
  }

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useRepoHeader(slots: Partial<RepoHeaderSlots>) {
  const api = useContext(RepoHeaderApiContext);
  if (!api) {
    throw new Error("useRepoHeader must be used within a RepoHeaderProvider");
  }

  const { setSlots, clearSlots } = api;
  const header = slots.header ?? null;
  const headerRef = useRef(header);
  headerRef.current = header;
  const ownerIdRef = useRef<number | null>(null);
  if (ownerIdRef.current == null) {
    ownerIdRef.current = nextHeaderOwnerId++;
  }
  const ownerId = ownerIdRef.current;

  // Sync after each render of the caller. Safe: store updates only notify
  // useRepoHeaderState subscribers (the header chrome), not this page.
  useLayoutEffect(() => {
    setSlots({ header: headerRef.current }, ownerId);
  });

  useLayoutEffect(() => {
    return () => {
      clearSlots(ownerId);
    };
  }, [clearSlots, ownerId]);
}

export function useOptionalRepoHeader(
  slots: Partial<RepoHeaderSlots>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const api = useContext(RepoHeaderApiContext);
  const setSlots = api?.setSlots;
  const clearSlots = api?.clearSlots;
  const header = slots.header ?? null;
  const headerRef = useRef(header);
  headerRef.current = header;
  const ownerIdRef = useRef<number | null>(null);
  if (ownerIdRef.current == null) {
    ownerIdRef.current = nextHeaderOwnerId++;
  }
  const ownerId = ownerIdRef.current;

  useLayoutEffect(() => {
    if (!setSlots || !enabled) return;
    setSlots({ header: headerRef.current }, ownerId);
  });

  useLayoutEffect(() => {
    if (!enabled) return;
    return () => {
      clearSlots?.(ownerId);
    };
  }, [clearSlots, enabled, ownerId]);
}
