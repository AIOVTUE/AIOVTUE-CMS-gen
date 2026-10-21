import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accountTable } from "@/db/schema";
import { MainRootLayout } from "../main-root-layout";
import { Installations } from "@/components/settings/installations";
import { Identities } from "@/components/settings/identities";
import { Profile } from "@/components/settings/profile";
import { RepoSwitchSettings } from "@/components/settings/repo-switch";
import { LoginBackgroundSettingsCard } from "@/components/settings/login-background-settings";
import { EmailLoginSettingsCard } from "@/components/settings/email-login-settings";
import { SiteUrlSettingsCard } from "@/components/settings/site-url-settings";
import { CommentSettingsCard } from "@/components/settings/comment-settings";
import { WebdavSettingsCard } from "@/components/settings/webdav-settings";
import { WebanalysiSettingsCard } from "@/components/settings/webanalysi-settings";
import { MemosSettingsCard } from "@/components/settings/memos-settings";
import { GlassSettingsCard } from "@/components/settings/glass-settings";
import { DocumentTitle } from "@/components/document-title";
import {
  Card,
  CardHeader,
  CardDescription,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import { getServerSession } from "@/lib/session-server";
import { isLocalDevBypassAuth } from "@/lib/local-repo/config";
import { hasAdminAccessAsync } from "@/lib/admin";
import { getAppConfig } from "@/lib/app-config/store";
import type { User } from "@/types/user";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function Page() {
  const session = await getServerSession();
  const user = session?.user;
  if (!user) throw new Error("User not found");
  const isAdmin = await hasAdminAccessAsync(user as User);

  let githubConnected = false;
  let githubManageUrl: string | null = null;

  if (!isLocalDevBypassAuth()) {
    const githubAccount = await db.query.accountTable.findFirst({
      where: and(
        eq(accountTable.userId, user.id),
        eq(accountTable.providerId, "github"),
      ),
    });
    githubConnected = Boolean(githubAccount);
    const appConfig = await getAppConfig();
    const clientId = appConfig.githubAppClientId;
    githubManageUrl = clientId
      ? `https://github.com/settings/connections/applications/${clientId}`
      : null;
  }

  return (
    <MainRootLayout title="设置" backHref="/">
      <DocumentTitle title="设置" />
      <div className="max-w-screen-sm mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col relative flex-1 space-y-6">
          <Profile
            name={user.name}
            email={user.email}
            image={user.image}
            githubUsername={user.githubUsername}
          />

          <Card>
            <CardHeader>
              <CardTitle>默认仓库</CardTitle>
            </CardHeader>
            <CardContent>
              <RepoSwitchSettings />
            </CardContent>
          </Card>

          <GlassSettingsCard />

          <SiteUrlSettingsCard />

          <CommentSettingsCard />

          <WebdavSettingsCard />

          <WebanalysiSettingsCard />

          <MemosSettingsCard />

          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>管理</CardTitle>
                <CardDescription>
                  实例指标、用户会话，以及站点部署参数。
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap justify-end gap-2">
                <Link
                  href="/admin"
                  className={buttonVariants({ variant: "outline" })}
                >
                  管理面板
                </Link>
                <Link
                  href="/settings/deployment"
                  className={buttonVariants({ variant: "outline" })}
                >
                  部署配置
                </Link>
              </CardContent>
            </Card>
          ) : null}

          {isAdmin ? <LoginBackgroundSettingsCard /> : null}

          <EmailLoginSettingsCard />

          <Card>
            <CardHeader>
              <CardTitle>身份验证</CardTitle>
              <CardDescription>您的登录方式与已关联的身份提供商。</CardDescription>
            </CardHeader>
            <CardContent>
              <Identities
                email={user.email}
                githubConnected={githubConnected}
                githubUsername={user.githubUsername}
                githubManageUrl={githubManageUrl}
              />
            </CardContent>
          </Card>

          {githubConnected && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base md:text-lg">安装</CardTitle>
                <CardDescription>
                  Manage the accounts the Github application is installed on.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Installations />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </MainRootLayout>
  );
}
