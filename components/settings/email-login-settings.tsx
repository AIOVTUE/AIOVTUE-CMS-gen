"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireApiSuccess } from "@/lib/api-client";
import type { EmailLoginSettingsPublic } from "@/lib/email-login/types";

export function EmailLoginSettingsCard() {
  const [settings, setSettings] = useState<EmailLoginSettingsPublic | null>(
    null,
  );
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/email-login/settings");
      const payload = await requireApiSuccess<{
        data: EmailLoginSettingsPublic;
      }>(response, "加载邮箱登录设置失败");
      setSettings(payload.data);
      setEnabled(payload.data.enabled);
      setEmail("");
      setPassword("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "加载邮箱登录设置失败",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (options?: { clearCredentials?: boolean }) => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/email-login/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          options?.clearCredentials
            ? { clearCredentials: true }
            : {
                enabled,
                ...(email.trim() ? { email: email.trim() } : {}),
                ...(password ? { password } : {}),
              },
        ),
      });
      const payload = await requireApiSuccess<{
        data: EmailLoginSettingsPublic;
      }>(response, "保存邮箱登录设置失败");
      setSettings(payload.data);
      setEnabled(payload.data.enabled);
      setEmail("");
      setPassword("");
      toast.success(
        options?.clearCredentials ? "已清除邮箱登录凭据。" : "邮箱登录设置已保存。",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>邮箱登录</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && !settings ? (
          <p className="text-muted-foreground text-sm">加载中…</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div className="space-y-1">
                <Label htmlFor="email-login-enabled">启用邮箱登录</Label>
                <p className="text-muted-foreground text-xs">
                  关闭后，即使已设置邮箱密码也无法用邮箱登录。
                </p>
              </div>
              <Switch
                id="email-login-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-login-email">登录邮箱</Label>
              <Input
                id="email-login-email"
                type="email"
                autoComplete="username"
                placeholder={
                  settings?.emailMasked
                    ? `当前：${settings.emailMasked}（留空则不修改）`
                    : "用于登录的邮箱"
                }
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-login-password">登录密码</Label>
              <Input
                id="email-login-password"
                type="password"
                autoComplete="new-password"
                placeholder={
                  settings?.hasCredentials
                    ? "已保存（留空则不修改）"
                    : "登录密码"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSaving}
              />
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          type="button"
          disabled={isSaving || isLoading}
          onClick={() => void handleSave()}
        >
          {isSaving ? (
            <span className="inline-flex items-center gap-2">
              保存中
              <Loader className="h-4 w-4 animate-spin" />
            </span>
          ) : (
            "保存"
          )}
        </Button>
        {settings?.hasCredentials && (
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => void handleSave({ clearCredentials: true })}
          >
            清除凭据
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
