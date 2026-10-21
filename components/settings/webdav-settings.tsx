"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
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
import { requireApiSuccess } from "@/lib/api-client";
import type { WebdavSettingsPublic } from "@/lib/webdav-settings/types";

const fetchSettings = async (url: string): Promise<WebdavSettingsPublic> => {
  const response = await fetch(url);
  const payload = await requireApiSuccess<{ data: WebdavSettingsPublic }>(
    response,
    "加载 WebDAV 设置失败",
  );
  return payload.data;
};

export function WebdavSettingsCard() {
  const { data, isLoading, mutate } = useSWR(
    "/api/webdav/settings",
    fetchSettings,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (!data) return;
    setBaseUrl(data.baseUrl || "");
    setUsername(data.username || "");
    setPassword("");
    setPasswordTouched(false);
  }, [data]);

  const dirty =
    (data?.baseUrl ?? "") !== baseUrl.trim() ||
    (data?.username ?? "") !== username.trim() ||
    passwordTouched;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/webdav/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          username: username.trim(),
          passwordTouched,
          ...(passwordTouched ? { password } : {}),
        }),
      });
      const payload = await requireApiSuccess<{ data: WebdavSettingsPublic }>(
        response,
        "保存 WebDAV 设置失败",
      );
      setBaseUrl(payload.data.baseUrl);
      setUsername(payload.data.username);
      setPassword("");
      setPasswordTouched(false);
      await mutate(payload.data, { revalidate: false });
      toast.success("WebDAV 设置已保存。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      if (dirty) {
        toast.error("请先保存 WebDAV 设置再测试连接。");
        return;
      }
      const response = await fetch("/api/webdav/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const payload = await requireApiSuccess<{
        data: { ok: boolean; message: string };
      }>(response, "测试连接失败");
      toast.success(payload.data.message || "WebDAV 连接正常。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试失败。");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>WebDAV</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="webdav-base-url">WebDAV 地址</Label>
          <Input
            id="webdav-base-url"
            type="url"
            placeholder="https://dav.example.com/remote.php/dav/files/user"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            disabled={isLoading || isSaving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="webdav-username">用户名</Label>
          <Input
            id="webdav-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={isLoading || isSaving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="webdav-password">密码 / 应用专用密码</Label>
          <Input
            id="webdav-password"
            type="password"
            autoComplete="new-password"
            placeholder={
              data?.hasPassword
                ? "已加密保存，留空并保存可清除"
                : "WebDAV 密码或应用专用密码"
            }
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setPasswordTouched(true);
            }}
            disabled={isLoading || isSaving}
          />
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          type="button"
          disabled={isLoading || isSaving || !dirty}
          onClick={() => void handleSave()}
        >
          {isSaving ? "保存中…" : "保存"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isLoading || isSaving || isTesting || !data?.configured}
          onClick={() => void handleTest()}
        >
          {isTesting ? "测试中…" : "测试连接"}
        </Button>
      </CardFooter>
    </Card>
  );
}
