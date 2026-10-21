"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getInitialsFromName, getUserAvatarSrc } from "@/lib/utils/avatar";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "lucide-react";

type ProfileProps = {
  name?: string | null;
  email: string;
  image?: string | null;
  githubUsername?: string | null;
};

export function Profile({ name, email, image, githubUsername }: ProfileProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(name?.trim() || "");
  const [avatarUrl, setAvatarUrl] = useState(image?.trim() || "");
  const [isSaving, setIsSaving] = useState(false);

  const initialName = name?.trim() || "";
  const initialImage = image?.trim() || "";
  const dirty =
    displayName.trim() !== initialName || avatarUrl.trim() !== initialImage;
  const canSave = displayName.trim().length > 0 && dirty && !isSaving;
  const avatarLabel = displayName.trim() || email;

  const previewSrc = useMemo(
    () =>
      getUserAvatarSrc({
        image: avatarUrl.trim() || null,
        githubUsername,
        email,
      }),
    [avatarUrl, email, githubUsername],
  );

  const handleSave = async () => {
    const nextName = displayName.trim();
    if (!nextName) return;

    const nextImage = avatarUrl.trim();
    if (
      nextImage &&
      !/^https?:\/\//i.test(nextImage) &&
      !nextImage.startsWith("data:")
    ) {
      toast.error("头像地址需为 http(s) 链接");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          image: nextImage || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.status !== "success") {
        throw new Error(
          payload?.message || payload?.error?.message || "更新资料失败。",
        );
      }

      toast.success("资料已更新。");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "更新资料失败。";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle>资料</CardTitle>
          <Avatar className="h-10 w-10 shrink-0 rounded-md">
            <AvatarImage src={previewSrc} alt={avatarLabel} />
            <AvatarFallback className="rounded-md">
              {getInitialsFromName(avatarLabel)}
            </AvatarFallback>
          </Avatar>
        </div>
      </CardHeader>
      <CardContent>
        <form
          className="w-full"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="grid w-full items-center gap-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-left">
                名称
              </Label>
              <div className="col-span-3">
                <Input
                  id="name"
                  name="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={120}
                  disabled={isSaving}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="picture" className="text-left">
                头像
              </Label>
              <div className="col-span-3">
                <Input
                  id="picture"
                  name="picture"
                  type="url"
                  placeholder="https://... 留空则使用默认头像"
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  disabled={isSaving}
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          size="sm"
          onClick={() => void handleSave()}
          disabled={!canSave}
        >
          保存资料
          {isSaving && <Loader className="ml-2 h-4 w-4 animate-spin" />}
        </Button>
      </CardFooter>
    </Card>
  );
}
