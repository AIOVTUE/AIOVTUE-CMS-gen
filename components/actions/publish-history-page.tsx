"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Loader, Upload } from "lucide-react";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { RepoPageHeader } from "@/components/repo/repo-page-header";
import { requireApiSuccess } from "@/lib/api-client";
import { CMS_LOCAL_SAVE_EVENT } from "@/lib/cms-client-events";
import type { PublishHistoryItem } from "@/types/publish-history";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type PublishHistoryPageProps = {
  owner: string;
  repo: string;
  branch: string;
};

const statusLabel = (status: string) => {
  if (status === "A" || status === "add") return "新增";
  if (status === "D" || status === "delete") return "删除";
  if (status === "R" || status === "rename") return "重命名";
  return "修改";
};

const commitUrl = (owner: string, repo: string, sha: string | null) => {
  if (!sha || owner === "local") return null;
  return `https://github.com/${owner}/${repo}/commit/${sha}`;
};

export function PublishHistoryPage({
  owner,
  repo,
  branch,
}: PublishHistoryPageProps) {
  const [items, setItems] = useState<PublishHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/${owner}/${repo}/${encodeURIComponent(branch)}/publish-history`,
      );
      const payload = await requireApiSuccess<{ data: { items: PublishHistoryItem[] } }>(
        response,
        "加载提交记录失败",
      );
      setItems(payload.data.items);
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [branch, owner, repo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onLocalSave = () => {
      void load();
    };
    window.addEventListener(CMS_LOCAL_SAVE_EVENT, onLocalSave);
    return () => window.removeEventListener(CMS_LOCAL_SAVE_EVENT, onLocalSave);
  }, [load]);

  const headerNode = useMemo(
    () => (
      <RepoPageHeader title="提交记录">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? <Loader className="h-4 w-4 animate-spin" /> : "刷新"}
        </Button>
      </RepoPageHeader>
    ),
    [load, loading],
  );

  useRepoHeader({ header: headerNode });

  if (items == null) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
        <Loader className="h-4 w-4 animate-spin" />
        加载中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        最近提交到 GitHub 的记录，最多保留 15 条。
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>说明</TableHead>
            <TableHead>文件</TableHead>
            <TableHead>提交者</TableHead>
            <TableHead>时间</TableHead>
            <TableHead>Commit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-muted-foreground py-10 text-center text-sm"
              >
                暂无提交记录。保存内容后点「发布修改」会出现在这里。
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => {
              const url = commitUrl(owner, repo, item.commitSha);
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <Upload className="text-muted-foreground h-4 w-4" />
                  </TableCell>
                  <TableCell className="max-w-[16rem]">
                    <div className="truncate font-medium">
                      {item.message || "发布修改"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{item.fileCount} 个文件</div>
                    <div className="text-muted-foreground max-w-[18rem] truncate font-mono text-xs">
                      {item.files
                        .slice(0, 3)
                        .map((file) => `${statusLabel(file.status)} ${file.path}`)
                        .join(" · ")}
                      {item.files.length > 3
                        ? ` · 另有 ${item.files.length - 3} 个`
                        : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.triggeredByName ||
                      item.triggeredByGithubUsername ||
                      item.triggeredByEmail ||
                      "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {formatDistanceToNowStrict(new Date(item.createdAt), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {url && item.commitSha ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {item.commitSha.slice(0, 7)}
                      </a>
                    ) : item.commitSha ? (
                      item.commitSha.slice(0, 7)
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
