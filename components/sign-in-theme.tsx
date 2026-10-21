"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import {
  DEFAULT_PRIMARY_COLOR,
  applyPrimaryColorTheme,
  clearPrimaryColorTheme,
} from "@/lib/theme/primary-color";

export function SignInTheme({
  primaryColor = DEFAULT_PRIMARY_COLOR,
}: {
  primaryColor?: string;
}) {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    applyPrimaryColorTheme(
      primaryColor,
      resolvedTheme === "dark" ? "dark" : "light",
    );

    return () => {
      clearPrimaryColorTheme();
    };
  }, [primaryColor, resolvedTheme]);

  return null;
}
