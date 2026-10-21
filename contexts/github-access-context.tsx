"use client";

import { createContext, useContext } from "react";

export type GithubAccessStatus = "ok" | "auth" | "forbidden" | "not_found" | "empty";

type GithubAccessContextValue = {
  status: GithubAccessStatus;
};

const GithubAccessContext = createContext<GithubAccessContextValue>({
  status: "ok",
});

export function GithubAccessProvider({
  status,
  children,
}: {
  status: GithubAccessStatus;
  children: React.ReactNode;
}) {
  return (
    <GithubAccessContext.Provider value={{ status }}>
      {children}
    </GithubAccessContext.Provider>
  );
}

export function useGithubAccess() {
  return useContext(GithubAccessContext);
}
