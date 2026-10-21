"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "use-debounce";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/contexts/user-context";
import { getGithubInstallationUrl } from "@/lib/github-app";
import { Button, buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronsUpDown, LockKeyhole, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { requireApiSuccess } from "@/lib/api-client";
import { encodeRepoSegment, repoHref } from "@/lib/repo-href";

const getRepoOpenHref = (result: {
  owner: string;
  repo: string;
  defaultBranch?: string | null;
  branch?: string | null;
}) => {
  const branch = (result.defaultBranch || result.branch || "").trim();
  if (branch) {
    // Branch root resolves to first content page (or configuration).
    return repoHref(result.owner, result.repo, branch);
  }
  // Let /[owner]/[repo] resolve the default branch server-side.
  return `/${encodeRepoSegment(result.owner)}/${encodeRepoSegment(result.repo)}`;
};

export function RepoSelect({
  onAccountSelect
}: {
  onAccountSelect?: (account: any) => void
}) {
  const { user } = useUser();
  const isGithubUser = hasGithubIdentity(user);

  const accounts = useMemo(() => {
    if (!user) return [];
    return user.accounts || [];
  }, [user]);

  const [selectedAccount, setSelectedAccount] = useState(accounts[0]);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword] = useDebounce(
    selectedAccount?.repositorySelection === "all" ? keyword : "",
    500
  );
  const [results, setResults] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const searchResults = useMemo(() => {
    if (!results) return [];
    if (selectedAccount?.repositorySelection !== "all") {
      return results.filter((result: any) => result.repo.toLowerCase().includes(keyword.toLowerCase()));
    }
    return results;
  }, [results, keyword, selectedAccount]);

  const selectedAccountInstallationUrl = useMemo(() => {
    if (!selectedAccount) return null;
    return getGithubInstallationUrl(selectedAccount);
  }, [selectedAccount]);

  const displayedKeyword = useMemo(() => {
    if (selectedAccount?.repositorySelection === "all") return debouncedKeyword.trim();
    return keyword.trim();
  }, [debouncedKeyword, keyword, selectedAccount]);

  useEffect(() => {
    const fetchResults = async () => {
      if (!selectedAccount) return;
  
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
  
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          type: selectedAccount.type,
          keyword: debouncedKeyword,
          repository_selection: selectedAccount.repositorySelection
        });
  
        const response = await fetch(
          `/api/repos/${selectedAccount.login}?${params.toString()}`,
          { signal: abortControllerRef.current.signal }
        );
        const data = await requireApiSuccess<{ status: string; data: any[]; message?: string }>(
          response,
          "Failed to fetch repos",
        );
  
        setResults(data.data);
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error(error);
          setResults([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [debouncedKeyword, selectedAccount]);

  const resultsLoadingSkeleton = useMemo(() => (
    <ul>
      {[...Array(5)].map((_, index) => (
        <li key={index} className="flex gap-x-2 items-center border border-b-0 last:border-b first:rounded-t-md last:rounded-b-md px-3 py-2 text-sm">
          <Skeleton className="h-5 w-24 text-left rounded" />
          <Skeleton className="h-5 w-24 text-left rounded" />
          <Button variant="outline" size="xs" className="ml-auto" disabled>
            Open
          </Button>
        </li>
      ))}
    </ul>
  ), []);

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex w-full max-w items-center gap-x-2">
        <ButtonGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <img className="size-6 rounded" src={`https://github.com/${selectedAccount?.login}.png`} alt={`${selectedAccount?.login}'s avatar`}/>
                <span className="mr-2">{selectedAccount?.login}</span>
                <ChevronsUpDown className="ml-auto h-4 w-4 opacity-50"/>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {accounts.map((account: any) => (
                <DropdownMenuItem
                  key={`${account.login}-${account.installationId}`}
                  onSelect={() => {
                    setSelectedAccount(account);
                    if (onAccountSelect) onAccountSelect(account);
                  }}
                >
                  <img className="size-6 rounded" src={`https://github.com/${account.login}.png`} alt={`${account.login}'s avatar`}/>
                  <span className="truncate">{account.login}</span>
                </DropdownMenuItem>
              ))}
              {isGithubUser &&
                <>
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem asChild>
                    {/* API route performs OAuth redirect — full navigation required. */}
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a href="/api/github-app/install">Manage GitHub accounts</a>
                  </DropdownMenuItem>
                </>
              }
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedAccountInstallationUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  className={cn(
                    buttonVariants({ variant: "outline", size: "icon" })
                  )}
                  href={selectedAccountInstallationUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Manage ${selectedAccount.login} installation settings on GitHub`}
                >
                  <Settings />
                </a>
              </TooltipTrigger>
              <TooltipContent sideOffset={6}>Manage GitHub App</TooltipContent>
            </Tooltip>
          )}
        </ButtonGroup>
        <div className="relative flex-1"> 
          <Input
            placeholder="按名称搜索仓库"
            className="pl-9"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none"/>
        </div>
      </div>
      {isLoading || results === null
        ? resultsLoadingSkeleton
        : searchResults.length > 0
          ? <ul>
              {searchResults.map((result: any) => (
                <li key={`${result.owner}/${result.repo}`} className="flex gap-x-2 items-center border border-b-0 last:border-b first:rounded-t-md last:rounded-b-md px-3 py-2 text-sm">
                  {/* Native <a>: soft App Router nav into repo shells often blanks until hard refresh. */}
                  <a
                    className="truncate font-medium hover:underline"
                    href={getRepoOpenHref(result)}
                  >{result.repo}</a>
                  {result.private && <LockKeyhole className="h-3 w-3 opacity-50"/>}
                  {result.updatedAt &&
                    <div className="text-muted-foreground truncate">{formatDistanceToNow(new Date(result.updatedAt))} ago</div>
                  }
                  <a
                    className={cn("ml-auto", buttonVariants({ variant: "outline", size: "xs"}))}
                    href={getRepoOpenHref(result)}
                  >
                    打开
                  </a>
                </li>
              ))}
            </ul>
          : <Empty className="h-[206px] flex-none bg-accent p-4 md:p-6">
              <EmptyHeader>
                <EmptyTitle>暂无项目</EmptyTitle>
                <EmptyDescription>
                  没有匹配您搜索的项目。
                </EmptyDescription>
              </EmptyHeader>
              {selectedAccountInstallationUrl && (
                <EmptyContent>
                  <a
                    href={selectedAccountInstallationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "outline" })}
                  >
                    管理 GitHub 应用
                  </a>
                </EmptyContent>
              )}
            </Empty>
      }
    </div>
  );
}
