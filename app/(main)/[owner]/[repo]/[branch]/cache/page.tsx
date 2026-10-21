import { DocumentTitle } from "@/components/document-title";
import { formatRepoBranchTitle } from "@/lib/document-title";
import { CachePage } from "@/components/cache/cache-page";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { isCacheEnabled } from "@/lib/config-flags";
import { getConfig } from "@/lib/config-store";
import { getServerSession } from "@/lib/session-server";
import type { User } from "@/types/user";

export default async function Page({
  params,
}: {
  params: Promise<{ owner: string; repo: string; branch: string }>;
}) {
  const { owner, repo, branch } = await params;
  const decodedBranch = decodeURIComponent(branch);
  const session = await getServerSession();
  const user = session?.user as User | undefined;

  if (!hasGithubIdentity(user)) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>访问被拒绝</EmptyTitle>
          <EmptyDescription>仅 GitHub 用户可管理缓存。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const config = await getConfig(owner, repo, decodedBranch);
  if (!config?.object || !isCacheEnabled(config.object)) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>缓存已禁用</EmptyTitle>
          <EmptyDescription>
            在 CMS 配置中设置 <code>settings.cache: true</code> 以启用缓存。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <DocumentTitle
        title={formatRepoBranchTitle("缓存", owner, repo, decodedBranch)}
      />
      <CachePage owner={owner} repo={repo} branch={decodedBranch} />
    </>
  );
}
