"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { User } from "@/types/user";

interface UserContextType {
  user: User | null;
  setUser: (user: User | null | ((prev: User | null) => User | null)) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};

export const UserProvider = ({
  user: initialUser,
  children,
}: {
  user: User | null;
  children: React.ReactNode;
}) => {
  const [user, setUserState] = useState<User | null>(initialUser);

  const setUser = useCallback(
    (next: User | null | ((prev: User | null) => User | null)) => {
      setUserState(next);
    },
    [],
  );

  const contextValue = useMemo(
    () => ({ user, setUser }),
    [user, setUser],
  );

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
};
