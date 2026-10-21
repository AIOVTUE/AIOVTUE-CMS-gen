"use client";

import { useEffect, useState, useTransition } from "react";
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
import {
  loadMemosSettingsAction,
  saveMemosSettingsAction,
} from "@/lib/memos-settings/actions";
import { invalidateAllMemosCache } from "@/lib/memos-settings/cache-keys";
import type { MemosSettingsPublic } from "@/lib/memos-settings/types";

export function MemosSettingsCard() {
  const [data, setData] = useState<MemosSettingsPublic | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const result = await loadMemosSettingsAction();
      if (cancelled) return;
      if (!result.ok) {
        toast.error(result.message);
        setIsLoading(false);
        return;
      }
      setData(result.data);
      setApiUrl(result.data.apiUrl || "");
      setUsername(result.data.username || "");
      setPassword("");
      setPasswordTouched(false);
      setIsLoading(false);
    })().catch((error: unknown) => {
      if (cancelled) return;
      toast.error(error instanceof Error ? error.message : "加载失败。");
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    (data?.apiUrl ?? "") !== apiUrl.trim() ||
    (data?.username ?? "") !== username.trim() ||
    passwordTouched;

  const handleSave = () => {
    startTransition(async () => {
      try {
        const result = await saveMemosSettingsAction({
          apiUrl: apiUrl.trim(),
          username: username.trim(),
          ...(passwordTouched ? { password } : {}),
          passwordTouched,
        });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setData(result.data);
        setApiUrl(result.data.apiUrl);
        setUsername(result.data.username);
        setPassword("");
        setPasswordTouched(false);
        invalidateAllMemosCache();
        toast.success("动态 API 设置已保存。");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败。");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>动态 API (AIOVTUE-memos)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="memos-api-url">动态 API 地址</Label>
          <Input
            id="memos-api-url"
            type="url"
            placeholder="https://dongtai.example.com"
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            disabled={isLoading || isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="memos-username">管理账号</Label>
          <Input
            id="memos-username"
            type="text"
            autoComplete="username"
            placeholder="admin"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={isLoading || isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="memos-password">管理密码</Label>
          <Input
            id="memos-password"
            type="password"
            placeholder={
              data?.hasPassword
                ? "已加密保存，留空并保存可清除"
                : "与 AIOVTUE-memos 管理密码相同"
            }
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setPasswordTouched(true);
            }}
            disabled={isLoading || isPending}
            autoComplete="new-password"
          />
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          type="button"
          disabled={isLoading || isPending || !dirty}
          onClick={handleSave}
        >
          {isPending ? "保存中…" : "保存"}
        </Button>
      </CardFooter>
    </Card>
  );
}
