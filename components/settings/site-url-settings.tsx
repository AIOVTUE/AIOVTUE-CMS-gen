"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader } from "lucide-react";
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
import type { ApiSuccess } from "@/types/api";
import type { SiteUrlSettingsPublic } from "@/lib/site-url/types";
import { faviconUrlFromSite } from "@/lib/site-url/favicon";

const resolveIconPreview = (iconUrl: string, siteUrl: string) => {
  const custom = iconUrl.trim();
  if (custom) {
    if (/^(https?:|data:|blob:)/i.test(custom) || custom.startsWith("//")) {
      return custom.startsWith("//") ? `https:${custom}` : custom;
    }
    if (custom.startsWith("/") && siteUrl.trim()) {
      try {
        return new URL(custom, siteUrl.trim()).toString();
      } catch {
        return custom;
      }
    }
    return custom;
  }
  return siteUrl.trim() ? faviconUrlFromSite(siteUrl.trim()) : "";
};

export function SiteUrlSettingsCard() {
  const { data, isLoading, mutate } = useSWR(
    "/api/site-url/settings",
    async (url: string) => {
      const response = await fetch(url);
      const payload = await requireApiSuccess<
        ApiSuccess<SiteUrlSettingsPublic>
      >(response, "加载站点地址失败");
      return payload.data;
    },
  );

  const [siteUrl, setSiteUrl] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (data) {
      setSiteUrl(data.siteUrl);
      setIconUrl(data.iconUrl);
    }
  }, [data]);

  const previewSrc = useMemo(
    () => resolveIconPreview(iconUrl, siteUrl),
    [iconUrl, siteUrl],
  );

  useEffect(() => {
    setPreviewFailed(false);
  }, [previewSrc]);

  const dirty =
    (data?.siteUrl ?? "") !== siteUrl.trim() ||
    (data?.iconUrl ?? "") !== iconUrl.trim();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/site-url/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl, iconUrl }),
      });
      const payload = await requireApiSuccess<
        ApiSuccess<SiteUrlSettingsPublic>
      >(response, "保存失败");
      setSiteUrl(payload.data.siteUrl);
      setIconUrl(payload.data.iconUrl);
      await mutate(payload.data, { revalidate: false });
      toast.success("返回站点已保存。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>返回站点</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && !data ? (
          <p className="text-muted-foreground text-sm">加载中…</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="site-url">站点地址</Label>
              <Input
                id="site-url"
                type="url"
                placeholder="https://example.com/"
                value={siteUrl}
                onChange={(event) => setSiteUrl(event.target.value)}
                disabled={isSaving}
                spellCheck={false}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-icon">图标地址</Label>
              <div className="flex items-center gap-2">
                {previewSrc && !previewFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewSrc}
                    alt=""
                    className="size-9 shrink-0 rounded-md border object-cover"
                    onError={() => setPreviewFailed(true)}
                  />
                ) : (
                  <div className="bg-muted size-9 shrink-0 rounded-md border" />
                )}
                <Input
                  id="site-icon"
                  type="url"
                  className="min-w-0 flex-1"
                  placeholder="https://.../favicon.ico 或留空自动获取"
                  value={iconUrl}
                  onChange={(event) => setIconUrl(event.target.value)}
                  disabled={isSaving}
                  spellCheck={false}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          size="sm"
          onClick={() => void handleSave()}
          disabled={isSaving || !dirty}
        >
          保存
          {isSaving ? <Loader className="ml-2 h-4 w-4 animate-spin" /> : null}
        </Button>
      </CardFooter>
    </Card>
  );
}
