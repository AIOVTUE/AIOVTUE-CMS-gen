"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requireApiSuccess } from "@/lib/api-client";
import type {
  CommentBackupIntervalHours,
  CommentBackupResult,
  CommentSettingsPublic,
} from "@/lib/comment-settings/types";

const fetchSettings = async (url: string): Promise<CommentSettingsPublic> => {
  const response = await fetch(url);
  const payload = await requireApiSuccess<{ data: CommentSettingsPublic }>(
    response,
    "加载评论设置失败",
  );
  return payload.data;
};

export function CommentSettingsCard() {
  const { data, isLoading, mutate } = useSWR(
    "/api/comment/settings",
    fetchSettings,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const [serverUrl, setServerUrl] = useState("");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupRemotePath, setBackupRemotePath] = useState("/pagecms/comments");
  const [backupIntervalHours, setBackupIntervalHours] =
    useState<CommentBackupIntervalHours>(24);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  useEffect(() => {
    if (!data) return;
    setServerUrl(data.provider === "twikoo" ? data.serverUrl || "" : "");
    setPassword("");
    setPasswordTouched(false);
    setBackupEnabled(Boolean(data.backupEnabled));
    setBackupRemotePath(data.backupRemotePath || "/pagecms/comments");
    setBackupIntervalHours(data.backupIntervalHours || 24);
  }, [data]);

  const savedServerUrl =
    data?.provider === "twikoo" ? data.serverUrl?.trim() || "" : "";
  const dirty =
    savedServerUrl !== serverUrl.trim() ||
    passwordTouched ||
    Boolean(data?.backupEnabled) !== backupEnabled ||
    (data?.backupRemotePath ?? "/pagecms/comments") !==
      backupRemotePath.trim() ||
    (data?.backupIntervalHours ?? 24) !== backupIntervalHours;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const trimmedUrl = serverUrl.trim();
      const provider = trimmedUrl ? "twikoo" : "";
      const response = await fetch("/api/comment/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          serverUrl: trimmedUrl,
          passwordTouched,
          ...(passwordTouched ? { password } : {}),
          backupEnabled: trimmedUrl ? backupEnabled : false,
          backupRemotePath: backupRemotePath.trim(),
          backupIntervalHours,
        }),
      });
      const payload = await requireApiSuccess<{ data: CommentSettingsPublic }>(
        response,
        "保存评论设置失败",
      );
      setServerUrl(
        payload.data.provider === "twikoo" ? payload.data.serverUrl : "",
      );
      setPassword("");
      setPasswordTouched(false);
      setBackupEnabled(payload.data.backupEnabled);
      setBackupRemotePath(payload.data.backupRemotePath);
      setBackupIntervalHours(payload.data.backupIntervalHours);
      await mutate(payload.data, { revalidate: false });
      toast.success("评论设置已保存。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackupNow = async () => {
    setIsBackingUp(true);
    try {
      if (dirty) {
        toast.error("请先保存评论设置再备份。");
        return;
      }
      const response = await fetch("/api/comment/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "manual", force: true }),
      });
      const payload = await requireApiSuccess<{ data: CommentBackupResult }>(
        response,
        "备份失败",
      );
      toast.success(payload.data.message);
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "备份失败。");
      await mutate();
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Twikoo 评论</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="comment-server-url">环境地址 (envId)</Label>
          <Input
            id="comment-server-url"
            type="url"
            placeholder="https://xxx.api.tcloudbase.com / https://twikoo.example.com"
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            disabled={isLoading || isSaving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="comment-password">管理密码</Label>
          <Input
            id="comment-password"
            type="password"
            autoComplete="new-password"
            placeholder={
              data?.hasPassword
                ? "已加密保存，留空并保存可清除"
                : "与 Twikoo 管理面板密码相同"
            }
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setPasswordTouched(true);
            }}
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="space-y-4 border-t pt-4">
          <p className="text-sm font-medium">评论自动备份</p>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="comment-backup-enabled">启用自动备份</Label>
            <input
              id="comment-backup-enabled"
              type="checkbox"
              className="size-4 accent-primary"
              checked={backupEnabled}
              onChange={(event) => setBackupEnabled(event.target.checked)}
              disabled={isLoading || isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comment-backup-path">WebDAV 目录</Label>
            <Input
              id="comment-backup-path"
              value={backupRemotePath}
              onChange={(event) => setBackupRemotePath(event.target.value)}
              placeholder="/pagecms/comments"
              disabled={isLoading || isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label>备份间隔</Label>
            <Select
              value={String(backupIntervalHours)}
              onValueChange={(value) =>
                setBackupIntervalHours(
                  Number(value) as CommentBackupIntervalHours,
                )
              }
              disabled={isLoading || isSaving}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">每 6 小时</SelectItem>
                <SelectItem value="12">每 12 小时</SelectItem>
                <SelectItem value="24">每天</SelectItem>
                <SelectItem value="168">每周</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {data?.lastBackupAt || data?.lastBackupStatus ? (
            <p className="text-muted-foreground text-xs">
              上次备份：
              {data.lastBackupAt
                ? formatDistanceToNow(new Date(data.lastBackupAt), {
                    addSuffix: true,
                    locale: zhCN,
                  })
                : "—"}
              {data.lastBackupStatus
                ? ` · ${data.lastBackupStatus}${
                    data.lastBackupMessage
                      ? `（${data.lastBackupMessage}）`
                      : ""
                  }`
                : ""}
            </p>
          ) : null}
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            isLoading ||
            isSaving ||
            isBackingUp ||
            !data?.hasPassword ||
            !serverUrl.trim()
          }
          onClick={() => void handleBackupNow()}
        >
          {isBackingUp ? "备份中…" : "立即备份"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isLoading || isSaving || !dirty}
          onClick={() => void handleSave()}
        >
          {isSaving ? "保存中…" : "保存"}
        </Button>
      </CardFooter>
    </Card>
  );
}
