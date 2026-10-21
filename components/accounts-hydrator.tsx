"use client";

import { useEffect } from "react";
import { useUser } from "@/contexts/user-context";

/**
 * Applies streamed GitHub/collaborator accounts onto UserProvider without
 * blocking the first paint of page children.
 */
export function AccountsHydrator({
  accounts,
}: {
  accounts: NonNullable<import("@/types/user").User["accounts"]>;
}) {
  const { setUser } = useUser();

  useEffect(() => {
    setUser((prev) => (prev ? { ...prev, accounts } : prev));
  }, [accounts, setUser]);

  return null;
}
