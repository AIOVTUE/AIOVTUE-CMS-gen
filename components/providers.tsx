"use client";

import { useEffect, useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { NavigationLoader } from "@/components/navigation-loader";
import { GlassPreferenceHydrator } from "@/components/settings/glass-settings";
import { PageBackgroundHydrator } from "@/components/page-background-hydrator";
import { Toaster } from "@/components/ui/sonner";
import { ActionToastProvider } from "@/contexts/action-toast-context";
import { UserProvider } from "@/contexts/user-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { User } from "@/types/user";
import {
  GLASS_CHANGE_EVENT,
  GLASS_STORAGE_KEY,
  readGlassEnabled,
} from "@/lib/glass-preference";

export function Providers({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User | null;
}) {
  const [glassEnabled, setGlassEnabled] = useState(false);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    setGlassEnabled(readGlassEnabled());
    setThemeReady(true);
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      setGlassEnabled(
        typeof detail === "boolean" ? detail : readGlassEnabled(),
      );
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== GLASS_STORAGE_KEY) return;
      setGlassEnabled(readGlassEnabled());
    };
    window.addEventListener(GLASS_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(GLASS_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const lockDark = themeReady && glassEnabled;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme={lockDark ? "dark" : undefined}
      enableSystem={false}
      disableTransitionOnChange
    >
      <GlassPreferenceHydrator />
      <PageBackgroundHydrator />
      <UserProvider user={user}>
        <TooltipProvider>
          <ActionToastProvider>
            <NavigationLoader />
            {children}
            <Toaster />
          </ActionToastProvider>
        </TooltipProvider>
      </UserProvider>
    </ThemeProvider>
  );
}
