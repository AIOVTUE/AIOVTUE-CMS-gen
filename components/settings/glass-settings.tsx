"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  GLASS_CHANGE_EVENT,
  GLASS_STORAGE_KEY,
  applyGlassEnabled,
  readGlassEnabled,
  writeGlassEnabled,
} from "@/lib/glass-preference";
import { cn } from "@/lib/utils";

export function GlassPreferenceHydrator() {
  useEffect(() => {
    applyGlassEnabled(readGlassEnabled());

    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== GLASS_STORAGE_KEY) return;
      applyGlassEnabled(readGlassEnabled());
    };
    const onChange = () => applyGlassEnabled(readGlassEnabled());
    window.addEventListener("storage", onStorage);
    window.addEventListener(GLASS_CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(GLASS_CHANGE_EVENT, onChange);
    };
  }, []);

  return null;
}

function ThemeModePicker({
  className,
}: {
  className?: string;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "bg-muted/40 h-9 animate-pulse rounded-md border",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 rounded-md border p-1",
        className,
      )}
      role="radiogroup"
      aria-label="颜色模式"
    >
      {(
        [
          { value: "light", label: "浅色" },
          { value: "dark", label: "深色" },
        ] as const
      ).map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={cn(
              "rounded-sm px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTheme(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function GlassSettingsCard() {
  const { setTheme } = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setEnabled(readGlassEnabled());
    setReady(true);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>外观</CardTitle>
        <CardDescription>
          玻璃效果开启时固定深色；关闭后可自行选择浅色或深色。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="glass-enabled">玻璃效果</Label>
            <p className="text-muted-foreground text-xs">
              默认关闭。开启后使用透明玻璃背景（固定深色）；关闭后使用纯色背景，并可切换深浅色。
            </p>
          </div>
          <Switch
            id="glass-enabled"
            checked={enabled}
            disabled={!ready}
            onCheckedChange={(next) => {
              setEnabled(next);
              writeGlassEnabled(next);
              setTheme(next ? "dark" : "light");
            }}
          />
        </div>

        {!enabled ? (
          <div className="space-y-2">
            <Label>颜色模式</Label>
            <ThemeModePicker />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Theme radios for the user menu — only when glass is off. */
export function UserThemeMenuItems({ onClick }: { onClick?: () => void }) {
  const { theme, setTheme } = useTheme();
  const [glassEnabled, setGlassEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setGlassEnabled(readGlassEnabled());
    setMounted(true);
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      setGlassEnabled(
        typeof detail === "boolean" ? detail : readGlassEnabled(),
      );
    };
    window.addEventListener(GLASS_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(GLASS_CHANGE_EVENT, onChange);
  }, []);

  if (!mounted || glassEnabled) return null;

  return (
    <>
      <DropdownMenuSeparator />
      <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
        主题
      </div>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={(value) => {
          setTheme(value);
          onClick?.();
        }}
      >
        <DropdownMenuRadioItem value="light">浅色</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">深色</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );
}
