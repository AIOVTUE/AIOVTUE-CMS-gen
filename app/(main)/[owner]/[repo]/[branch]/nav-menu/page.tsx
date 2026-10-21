import { DocumentTitle } from "@/components/document-title";
import { formatRepoBranchTitle } from "@/lib/document-title";
import { NavMenuSettings } from "@/components/nav-menu-settings/nav-menu-settings";

export default async function Page({
  params,
}: {
  params: Promise<{ owner: string; repo: string; branch: string }>;
}) {
  const { owner, repo, branch } = await params;
  const decodedBranch = decodeURIComponent(branch);

  return (
    <>
      <DocumentTitle
        title={formatRepoBranchTitle("顶栏菜单", owner, repo, decodedBranch)}
      />
      <NavMenuSettings />
    </>
  );
}
