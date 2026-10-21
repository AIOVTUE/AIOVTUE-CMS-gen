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
  loadWebanalysiSettingsAction,
  saveWebanalysiSettingsAction,
} from "@/lib/webanalysi-settings/actions";
import type { WebanalysiSettingsPublic } from "@/lib/webanalysi-settings/types";
import { invalidateSessionCacheByPrefix } from "@/lib/session-memory-cache";

export function WebanalysiSettingsCard() {
  const [data, setData] = useState<WebanalysiSettingsPublic | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const result = await loadWebanalysiSettingsAction();
      if (cancelled) return;
      if (!result.ok) {
        toast.error(result.message);
        setIsLoading(false);
        return;
      }
      setData(result.data);
      setApiUrl(result.data.apiUrl || "");
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
    (data?.apiUrl ?? "") !== apiUrl.trim() || passwordTouched;

  const handleSave = () => {
    startTransition(async () => {
      try {
        const result = await saveWebanalysiSettingsAction({
          apiUrl: apiUrl.trim(),
          ...(passwordTouched ? { password } : {}),
          passwordTouched,
        });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        invalidateSessionCacheByPrefix("webanalysi:");
        setData(result.data);
        setApiUrl(result.data.apiUrl);
        setPassword("");
        setPasswordTouched(false);
        toast.success("访问统计设置已保存。");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败。");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>访问统计 (AIOVTUE-analytics)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="webanalysi-api-url">Analytics 地址</Label>
          <Input
            id="webanalysi-api-url"
            type="url"
            placeholder="https://analytics.example.com"
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            disabled={isLoading || isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="webanalysi-password">访问密码（可选）</Label>
          <Input
            id="webanalysi-password"
            type="password"
            placeholder={
              data?.hasPassword
                ? "已加密保存，留空并保存可清除"
                : "与 analytics 访问密码相同"
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
