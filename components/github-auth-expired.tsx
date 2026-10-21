"use client";

import { GithubAuthorizePrompt } from "@/components/github-authorize-prompt";

/** @deprecated Prefer GithubAuthorizePrompt; kept for existing imports. */
const GithubAuthExpired = () => (
  <GithubAuthorizePrompt
    title="需要重新连接 GitHub"
    description="GitHub 授权已过期或失效。若你使用邮箱登录，请点击「授权 GitHub」完成授权后继续访问。"
  />
);

export { GithubAuthExpired };
