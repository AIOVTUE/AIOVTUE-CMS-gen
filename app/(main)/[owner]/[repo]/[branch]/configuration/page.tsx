import { DocumentTitle } from "@/components/document-title";
import { formatRepoBranchTitle } from "@/lib/document-title";
import { MenuSettings } from "@/components/menu-settings/menu-settings";

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
        title={formatRepoBranchTitle("内容页面", owner, repo, decodedBranch)}
      />
      <MenuSettings />
    </>
  );
}
