import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/app-config/store";
import { requireApiUserSession } from "@/lib/session-server";

const GITHUB_APP_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

export const GET = async () => {
  const sessionResult = await requireApiUserSession();
  if ("response" in sessionResult) return sessionResult.response;

  const config = await getAppConfig();
  const appName = config.githubAppName.trim().toLowerCase();

  if (!appName) {
    return NextResponse.json(
      { status: "error", message: "未配置 GitHub App 名称。请完成初始化。" },
      { status: 500 },
    );
  }

  if (!GITHUB_APP_NAME_RE.test(appName)) {
    return NextResponse.json(
      { status: "error", message: "GitHub App 名称格式无效。" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(
    `https://github.com/apps/${encodeURIComponent(appName)}/installations/new`,
  );
};
