"use client";

import { useEffect } from "react";
import { useAppRouter } from "@/hooks/use-app-router";
import { useRepo } from "@/contexts/repo-context";
import { repoHref } from "@/lib/repo-href";

export default function Page() {
  const { owner, repo, defaultBranch } = useRepo();
  const router = useAppRouter();

  useEffect(() => {
    if (!defaultBranch) return;
    router.replace(repoHref(owner, repo, defaultBranch));
  }, [owner, repo, defaultBranch, router]);

  return null;
}
