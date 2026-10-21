"use client";

import { useMemo, useState } from "react";
import { useAppRouter } from "@/hooks/use-app-router";
import { useConfig } from "@/contexts/config-context";
import { useRepo } from "@/contexts/repo-context";
import { RepoBranches } from "./repo-branches";
import { LocalWorkspaceDialog } from "./local-workspace-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { ArrowUpRight, ChevronsUpDown, FolderOpen } from "lucide-react";
import { repoHref } from "@/lib/repo-href";

export function RepoDropdown({
  onClick
}: {
  onClick?: () => void;
}) {
  const router = useAppRouter();
  const { owner, repo, branches, defaultBranch } = useRepo();
  const { config } = useConfig();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const displayBranches = useMemo(() => {
    let branchesToDisplay: string[] = [];
    if (config) {
      // Always surface the active branch even before full list hydrates.
      if (config.branch) branchesToDisplay.push(config.branch);
      if (defaultBranch && config.branch !== defaultBranch) {
        branchesToDisplay.push(defaultBranch);
      }
      if (branches && branches.length > 0) {
        branchesToDisplay = branchesToDisplay.concat(
          branches
            .filter(
              (branch) =>
                branch !== config.branch && branch !== defaultBranch,
            )
            .slice(0, 5 - branchesToDisplay.length),
        );
      }
    }
    return branchesToDisplay;
  }, [branches, config, defaultBranch]);

  const branchesCount = useMemo(() => {
    if (branches && branches.length > 5) return `5/${branches.length}`;
    return null;
  }, [branches]);

  const handleBranchChange = (branch: string) => {
    router.push(repoHref(owner, repo, branch));
  };

  return (
    <>
      <Dialog>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full h-15 justify-start px-3">
              <img className="h-10 w-10 rounded-lg" src={`https://github.com/${owner}.png`} alt="Picture of the author" />
              <div className="text-left overflow-hidden ml-3">
                <div className="font-medium truncate">{repo}</div>
                <div className="text-xs text-muted-foreground truncate">{config?.branch}</div>
              </div>
              <ChevronsUpDown className="ml-auto h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={`https://github.com/${owner}/${repo}`} target="_blank" onClick={onClick} >在 GitHub 上查看<ArrowUpRight className="size-3 text-muted-foreground ml-auto" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                onClick?.();
                setWorkspaceOpen(true);
              }}
            >
              选择本地项目目录
              <FolderOpen className="ml-auto size-3.5 text-muted-foreground" />
            </DropdownMenuItem>
            <DropdownMenuSeparator/>
            <DropdownMenuLabel className="w-40 text-xs text-muted-foreground font-medium">Branches{branchesCount && ` (${branchesCount})`}</DropdownMenuLabel>
              {displayBranches.length > 0 && (
                <>
                  <DropdownMenuRadioGroup value={config?.branch} onValueChange={handleBranchChange}>
                    {displayBranches.map((branch: string) => (
                      <DropdownMenuRadioItem key={branch} value={branch} className="max-w-64" onClick={onClick}>
                        <span className="truncate">{branch}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator/>
                </>
              )}
            <DialogTrigger asChild>
              <DropdownMenuItem onClick={onClick}>管理分支</DropdownMenuItem>
            </DialogTrigger>
          </DropdownMenuContent>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>管理分支</DialogTitle>
            </DialogHeader>
            <RepoBranches/>
          </DialogContent>
        </DropdownMenu>
      </Dialog>
      <LocalWorkspaceDialog open={workspaceOpen} onOpenChange={setWorkspaceOpen} />
    </>
  );
}
