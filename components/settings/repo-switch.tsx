"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppRouter } from "@/hooks/use-app-router";
import { RepoSelect } from "@/components/repo/repo-select";
import { Button } from "@/components/ui/button";
import {
  clearDefaultRepo,
  getDefaultRepo,
  getRepoBasePath,
  type DefaultRepo,
} from "@/lib/default-repo";

export function RepoSwitchSettings() {
  const router = useAppRouter();
  const [current, setCurrent] = useState<DefaultRepo | null>(null);

  useEffect(() => {
    setCurrent(getDefaultRepo());
  }, []);

  const handleClearAndChoose = () => {
    clearDefaultRepo();
    setCurrent(null);
    router.push("/");
  };

  return (
    <div className="space-y-4">
      {current ? (
        <div className="bg-muted/40 flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <div className="text-muted-foreground">当前默认仓库</div>
            <div className="truncate font-medium">
              {current.owner}/{current.repo}
              <span className="text-muted-foreground">
                {" "}
                · {current.branch}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={getRepoBasePath(current)}>
                打开项目
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearAndChoose}
            >
              更换仓库
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">选择仓库</h3>
        <RepoSelect />
      </div>
    </div>
  );
}
