"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requireApiSuccess } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type { AppConfigPublic } from "@/lib/app-config/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";

type SetupPayload = {
  config: AppConfigPublic;
  complete: boolean;
  bootstrapped?: boolean;
};

type FormState = {
  baseUrl: string;
  githubAppId: string;
  githubAppName: string;
  githubAppClientId: string;
  githubAppClientSecret: string;
  githubAppPrivateKey: string;
  githubAppWebhookSecret: string;
  adminEmails: string;
  githubAllowedUsernames: string;
};

const emptyForm = (): FormState => ({
  baseUrl: "",
  githubAppId: "",
  githubAppName: "",
  githubAppClientId: "",
  githubAppClientSecret: "",
  githubAppPrivateKey: "",
  githubAppWebhookSecret: "",
  adminEmails: "",
  githubAllowedUsernames: "",
});

const formFromConfig = (c: AppConfigPublic): FormState => ({
  ...emptyForm(),
  baseUrl: c.baseUrl || "",
  githubAppId: c.githubAppId,
  githubAppName: c.githubAppName,
  githubAppClientId: c.githubAppClientId,
  adminEmails: c.adminEmails,
  githubAllowedUsernames: c.githubAllowedUsernames,
});

export function SetupWizard({
  initial,
  mode = "setup",
}: {
  initial?: SetupPayload | null;
  mode?: "setup" | "settings";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [complete, setComplete] = useState(initial?.complete ?? false);
  const [bootstrapped, setBootstrapped] = useState(
    initial?.bootstrapped ?? false,
  );
  const [publicConfig, setPublicConfig] = useState<AppConfigPublic | null>(
    initial?.config ?? null,
  );
  const [form, setForm] = useState<FormState>(() =>
    initial?.config ? formFromConfig(initial.config) : emptyForm(),
  );
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/setup");
      const payload = await requireApiSuccess<ApiSuccess<SetupPayload>>(
        response,
        "加载配置失败",
      );
      setComplete(payload.data.complete);
      setBootstrapped(Boolean(payload.data.bootstrapped));
      setPublicConfig(payload.data.config);
      setForm(formFromConfig(payload.data.config));
      if (mode === "setup" && payload.data.config.setupComplete) {
        router.replace("/sign-in");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载配置失败");
    } finally {
      setLoading(false);
    }
  }, [mode, router]);

  useEffect(() => {
    if (!initial) void load();
  }, [initial, load]);

  useEffect(() => {
    setForm((prev) =>
      prev.baseUrl ? prev : { ...prev, baseUrl: window.location.origin },
    );
  }, []);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleBootstrap = async (event: React.FormEvent) => {
    event.preventDefault();
    setBootstrapping(true);
    try {
      const origin = form.baseUrl || window.location.origin;
      const response = await fetch("/api/setup/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminEmail.trim(),
          password: adminPassword,
          baseUrl: origin,
        }),
      });
      await requireApiSuccess(response, "创建管理员失败");
      const email = adminEmail.trim().toLowerCase();
      setBootstrapped(true);
      setForm((prev) => ({
        ...prev,
        baseUrl: prev.baseUrl || origin,
        adminEmails: email,
      }));
      setPublicConfig((prev) =>
        prev
          ? { ...prev, adminEmails: email, baseUrl: prev.baseUrl || origin }
          : prev,
      );
      toast.success("管理员已创建，请继续配置站点与 GitHub App。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setBootstrapping(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/setup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          emailProvider: "",
          emailFrom: "",
        }),
      });
      const payload = await requireApiSuccess<ApiSuccess<SetupPayload>>(
        response,
        "保存失败",
      );
      setComplete(true);
      setPublicConfig(payload.data.config);
      toast.success(mode === "setup" ? "初始化完成，请登录。" : "部署配置已保存。");
      if (mode === "setup") {
        window.location.assign("/sign-in");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="size-4 animate-spin" />
        加载中…
      </div>
    );
  }

  const siteRoot = (form.baseUrl || "{站点地址}").replace(/\/$/, "");
  const showAdminStep = mode === "setup" && !bootstrapped && !complete;
  // Entire first-run setup is login-free; login only after setup completes.
  const showDeploySteps =
    mode === "settings" ||
    (mode === "setup" && bootstrapped && !complete) ||
    (mode === "setup" && complete);

  if (showAdminStep) {
    return (
      <form
        onSubmit={handleBootstrap}
        className="mx-auto max-w-2xl space-y-6 p-4 md:p-8"
      >
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">首次初始化</h1>
          <p className="text-muted-foreground text-sm">
            第 1 步：创建管理员邮箱与密码（供初始化完成后登录使用）。保存后即可继续配置，全程无需登录。
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>邮箱登录</CardTitle>
            <CardDescription>
              此账号将作为站点管理员，初始化完成后用它登录。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setup-admin-email">登录邮箱</Label>
              <Input
                id="setup-admin-email"
                type="email"
                autoComplete="username"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                disabled={bootstrapping}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-admin-password">登录密码</Label>
              <Input
                id="setup-admin-password"
                type="password"
                autoComplete="new-password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="登录密码"
                required
                disabled={bootstrapping}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="submit" disabled={bootstrapping}>
            {bootstrapping ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                保存中…
              </>
            ) : (
              "保存并继续"
            )}
          </Button>
        </div>
      </form>
    );
  }

  if (!showDeploySteps) {
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "setup" ? "首次初始化" : "部署配置"}
        </h1>
        {mode === "setup" ? (
          <p className="text-muted-foreground text-sm">
            第 2 步：配置站点地址与 GitHub App，完成后即可使用。
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>站点</CardTitle>
          <CardDescription>应用对外访问地址，需与 GitHub App 回调 URL 一致。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="baseUrl">站点地址</Label>
            <Input
              id="baseUrl"
              value={form.baseUrl}
              onChange={(e) => setField("baseUrl", e.target.value)}
              placeholder="https://cms.example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminEmails">管理员邮箱</Label>
            <Input
              id="adminEmails"
              value={form.adminEmails}
              onChange={(e) => setField("adminEmails", e.target.value)}
              placeholder="admin@example.com,other@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="githubAllowedUsernames">GitHub 登录白名单（可选）</Label>
            <Input
              id="githubAllowedUsernames"
              value={form.githubAllowedUsernames}
              onChange={(e) => setField("githubAllowedUsernames", e.target.value)}
              placeholder="留空表示不限制"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GitHub App</CardTitle>
          <CardDescription className="space-y-2">
            <span className="block">
              按下列步骤创建 GitHub App，再把凭证填入下方表单：
            </span>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>
                打开 GitHub → Settings → Developer settings → GitHub Apps → New
                GitHub App。
              </li>
              <li>
                「Homepage URL」填写上方的站点地址
                {form.baseUrl ? (
                  <>
                    （
                    <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                      {siteRoot}
                    </code>
                    ）
                  </>
                ) : null}
                ；「Callback URL」填写{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground break-all">
                  {`${siteRoot}/api/auth/callback/github`}
                </code>
                ，并勾选 Request user authorization。
              </li>
              <li>
                「Webhook URL」填写{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground break-all">
                  {`${siteRoot}/api/webhook/github`}
                </code>
                ，自行设置 Webhook secret 并记下来（填到下方「Webhook Secret」）。
              </li>
              <li>
                仓库权限建议：Contents、Metadata、Pull requests 至少选
                Read；需要 CMS 写回仓库时 Contents 选 Read and
                write。Webhook 可勾选 push、installation 等事件。
              </li>
              <li>
                创建后在 App 详情页复制 App ID、名称（即 URL 里{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                  github.com/apps/…
                </code>{" "}
                那段）、Client ID；再生成 Client secret 与私钥（Generate a private
                key，下载 .pem），全部填入下方。
              </li>
            </ol>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="githubAppId">App ID</Label>
              <Input
                id="githubAppId"
                value={form.githubAppId}
                onChange={(e) => setField("githubAppId", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="githubAppName">App 名称（URL 名）</Label>
              <Input
                id="githubAppName"
                value={form.githubAppName}
                onChange={(e) => setField("githubAppName", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="githubAppClientId">Client ID</Label>
            <Input
              id="githubAppClientId"
              value={form.githubAppClientId}
              onChange={(e) => setField("githubAppClientId", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="githubAppClientSecret">
              Client Secret
              {publicConfig?.hasGithubAppClientSecret ? "（已保存，留空则不修改）" : ""}
            </Label>
            <Input
              id="githubAppClientSecret"
              type="password"
              value={form.githubAppClientSecret}
              onChange={(e) => setField("githubAppClientSecret", e.target.value)}
              required={!publicConfig?.hasGithubAppClientSecret}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="githubAppPrivateKey">
              私钥 PEM
              {publicConfig?.hasGithubAppPrivateKey ? "（已保存，留空则不修改）" : ""}
            </Label>
            <Textarea
              id="githubAppPrivateKey"
              value={form.githubAppPrivateKey}
              onChange={(e) => setField("githubAppPrivateKey", e.target.value)}
              className="min-h-16 max-h-28 font-mono text-xs"
              required={!publicConfig?.hasGithubAppPrivateKey}
              placeholder="-----BEGIN RSA PRIVATE KEY-----"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="githubAppWebhookSecret">
              Webhook Secret
              {publicConfig?.hasGithubAppWebhookSecret ? "（已保存，留空则不修改）" : ""}
            </Label>
            <Input
              id="githubAppWebhookSecret"
              type="password"
              value={form.githubAppWebhookSecret}
              onChange={(e) => setField("githubAppWebhookSecret", e.target.value)}
              autoComplete="off"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              保存中…
            </>
          ) : mode === "setup" ? (
            "完成初始化"
          ) : (
            "保存配置"
          )}
        </Button>
      </div>
    </form>
  );
}
