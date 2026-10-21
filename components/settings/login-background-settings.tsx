"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireApiSuccess } from "@/lib/api-client";
import type { LoginBackgroundPublic } from "@/lib/login-background/types";
import {
  DEFAULT_LOGIN_BG_DESKTOP,
  DEFAULT_LOGIN_BG_MOBILE,
} from "@/lib/login-background/defaults";
import { dispatchPageBackgroundChange } from "@/lib/login-background/apply-page-background";

export function LoginBackgroundSettingsCard() {
  const [settings, setSettings] = useState<LoginBackgroundPublic | null>(null);
  const [desktopUrl, setDesktopUrl] = useState("");
  const [mobileUrl, setMobileUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/login-background");
      const payload = await requireApiSuccess<{ data: LoginBackgroundPublic }>(
        response,
        "加载页面背景失败",
      );
      setSettings(payload.data);
      setDesktopUrl(payload.data.desktopCustom ? payload.data.desktopUrl : "");
      setMobileUrl(payload.data.mobileCustom ? payload.data.mobileUrl : "");
      dispatchPageBackgroundChange({
        desktopUrl: payload.data.desktopUrl,
        mobileUrl: payload.data.mobileUrl,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载页面背景失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/login-background", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desktopUrl: desktopUrl.trim(),
          mobileUrl: mobileUrl.trim(),
        }),
      });
      const payload = await requireApiSuccess<{ data: LoginBackgroundPublic }>(
        response,
        "保存页面背景失败",
      );
      setSettings(payload.data);
      setDesktopUrl(payload.data.desktopCustom ? payload.data.desktopUrl : "");
      setMobileUrl(payload.data.mobileCustom ? payload.data.mobileUrl : "");
      dispatchPageBackgroundChange({
        desktopUrl: payload.data.desktopUrl,
        mobileUrl: payload.data.mobileUrl,
      });
      toast.success("页面背景已保存（含登录页）");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setDesktopUrl("");
    setMobileUrl("");
    setIsSaving(true);
    try {
      const response = await fetch("/api/login-background", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desktopUrl: "", mobileUrl: "" }),
      });
      const payload = await requireApiSuccess<{ data: LoginBackgroundPublic }>(
        response,
        "恢复默认背景失败",
      );
      setSettings(payload.data);
      setDesktopUrl("");
      setMobileUrl("");
      dispatchPageBackgroundChange({
        desktopUrl: payload.data.desktopUrl,
        mobileUrl: payload.data.mobileUrl,
      });
      toast.success("已恢复默认页面背景");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "恢复失败");
    } finally {
      setIsSaving(false);
    }
  };

  const previewDesktop = desktopUrl.trim() || DEFAULT_LOGIN_BG_DESKTOP;
  const previewMobile = mobileUrl.trim() || DEFAULT_LOGIN_BG_MOBILE;

  return (
    <Card>
      <CardHeader>
        <CardTitle>页面背景</CardTitle>
        <CardDescription>
          同时作用于应用内页面与登录页。仅支持图床链接（http/https），留空则使用本地默认图。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && !settings ? (
          <p className="text-muted-foreground text-sm">加载中…</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="page-bg-desktop">电脑端背景</Label>
              <Input
                id="page-bg-desktop"
                value={desktopUrl}
                onChange={(event) => setDesktopUrl(event.target.value)}
                placeholder="图床链接，留空使用默认"
                disabled={isSaving}
              />
              <div className="overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewDesktop}
                  alt="电脑端预览"
                  className="h-28 w-full object-cover"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-bg-mobile">手机端背景</Label>
              <Input
                id="page-bg-mobile"
                value={mobileUrl}
                onChange={(event) => setMobileUrl(event.target.value)}
                placeholder="图床链接，留空使用默认"
                disabled={isSaving}
              />
              <div className="mx-auto w-28 overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewMobile}
                  alt="手机端预览"
                  className="aspect-[9/16] w-full object-cover"
                />
              </div>
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
          保存
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSaving || isLoading}
          onClick={() => void handleReset()}
        >
          恢复默认
        </Button>
      </CardFooter>
    </Card>
  );
}
