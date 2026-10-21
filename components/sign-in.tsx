"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { getAuthCallbackURL, getSafeRedirect } from "@/lib/auth-redirect";
import {
  clearSavedLoginCredentials,
  loadSavedLoginCredentials,
  saveLoginCredentials,
} from "@/lib/login-credentials/client-storage";
import { sanitizeLoginBackgroundUrl } from "@/lib/login-credentials/sanitize-css-url";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader } from "lucide-react";
import {
  DEFAULT_LOGIN_BG_DESKTOP,
  DEFAULT_LOGIN_BG_MOBILE,
} from "@/lib/login-background/defaults";
import "./sign-in.css";

export function SignIn({
  desktopBg = DEFAULT_LOGIN_BG_DESKTOP,
  mobileBg = DEFAULT_LOGIN_BG_MOBILE,
  showGithub = true,
}: {
  desktopBg?: string;
  mobileBg?: string;
  /** Hide GitHub OAuth until GitHub App credentials are configured. */
  showGithub?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(false);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [submittingMethod, setSubmittingMethod] = useState<
    "github" | "email" | null
  >(null);
  const isSubmitting = submittingMethod !== null;

  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "";
  const redirectParam = searchParams.get("redirect") || "";
  const safeRedirect = getSafeRedirect(redirectParam);
  const callbackURL = getAuthCallbackURL(safeRedirect);
  const errorCallbackURL =
    safeRedirect === "/"
      ? "/sign-in"
      : `/sign-in?redirect=${encodeURIComponent(safeRedirect)}`;

  const getErrorMessage = (value: string) => {
    const decoded = (() => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    })();
    if (decoded.includes("无权登录") || decoded.toLowerCase().includes("not allowed")) {
      return "该 GitHub 账号无权登录。请使用已授权的账号。";
    }
    if (decoded.toLowerCase() !== "unable_to_get_user_info") return decoded;
    return [
      "GitHub 拒绝了资料访问权限。请在 GitHub 设置 > 应用程序 > 已授权的 GitHub 应用 / 已授权的 OAuth 应用 中重新授权 Pages CMS，然后重试。",
      "https://github.com/settings/applications",
    ].join(" ");
  };

  useEffect(() => {
    if (error) toast.error(getErrorMessage(error), { duration: 12000 });
  }, [error]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const saved = await loadSavedLoginCredentials();
      if (cancelled) return;

      if (saved) {
        setEmail(saved.email);
        setPassword(saved.password);
        setRememberLogin(true);
      }
      setCredentialsLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!credentialsLoaded) return;

    const emailParam = searchParams.get("email");
    if (emailParam) setEmail(emailParam.trim().toLowerCase());
  }, [credentialsLoaded, searchParams]);

  const cssVars = {
    ["--sign-in-bg-desktop" as string]: `url("${sanitizeLoginBackgroundUrl(desktopBg, DEFAULT_LOGIN_BG_DESKTOP)}")`,
    ["--sign-in-bg-mobile" as string]: `url("${sanitizeLoginBackgroundUrl(mobileBg, DEFAULT_LOGIN_BG_MOBILE)}")`,
  };

  const handleGithubSignIn = async () => {
    setSubmittingMethod("github");
    try {
      const result = await signIn.social({
        provider: "github",
        callbackURL,
        errorCallbackURL,
        disableRedirect: true,
      });
      if (result.error?.message) {
        toast.error(result.error.message);
        setSubmittingMethod(null);
        return;
      }

      if (result.data?.url) {
        window.location.assign(result.data.url);
        return;
      }

      setSubmittingMethod(null);
      toast.error("无法启动 GitHub 登录，请重试。");
    } catch (error: any) {
      toast.error(error?.message || "无法启动 GitHub 登录。");
      setSubmittingMethod(null);
    }
  };

  const handleEmailSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("请输入邮箱");
      return;
    }
    if (!password) {
      toast.error("请输入密码");
      return;
    }

    setSubmittingMethod("email");
    try {
      const response = await fetch("/api/email-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.status !== "success") {
        throw new Error(
          payload?.message || "邮箱或密码错误，或未启用邮箱登录。",
        );
      }

      if (rememberLogin) {
        await saveLoginCredentials({
          email: normalizedEmail,
          password,
        });
      } else {
        clearSavedLoginCredentials();
      }

      window.location.assign(safeRedirect);
    } catch (error: any) {
      toast.error(error?.message || "登录失败。");
      setSubmittingMethod(null);
    }
  };

  return (
    <div className="sign-in-page" style={cssVars}>
      <div className="sign-in-page__panel sm:max-w-[340px] w-full">
        <div className="space-y-6">
          <h1 className="text-lg font-medium tracking-tight text-center">
            登录 AIOVTUE
          </h1>
          <div className="space-y-2">
            <form
              className="space-y-2"
              onSubmit={async (event) => {
                event.preventDefault();
                await handleEmailSignIn();
              }}
            >
              <Input
                type="email"
                name="email"
                placeholder="邮箱"
                required
                autoComplete="username"
                disabled={isSubmitting}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Input
                type="password"
                name="password"
                placeholder="密码"
                required
                autoComplete={rememberLogin ? "off" : "current-password"}
                disabled={isSubmitting}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <div className="sign-in-page__remember">
                <Checkbox
                  id="remember-login"
                  checked={rememberLogin}
                  onCheckedChange={(checked) => {
                    const next = checked === true;
                    setRememberLogin(next);
                    if (!next) {
                      clearSavedLoginCredentials();
                    }
                  }}
                  disabled={isSubmitting}
                />
                <Label htmlFor="remember-login">记住登录信息</Label>
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                使用邮箱登录
                {submittingMethod === "email" && (
                  <Loader className="size-4 animate-spin" />
                )}
              </Button>
            </form>
            {showGithub ? (
              <Button
                type="button"
                className="w-full"
                onClick={handleGithubSignIn}
                disabled={isSubmitting}
              >
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="currentColor"
                >
                  <title>GitHub</title>
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
                使用 GitHub 登录
                {submittingMethod === "github" && (
                  <Loader className="size-4 animate-spin" />
                )}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
