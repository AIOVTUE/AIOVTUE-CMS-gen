import { DocumentTitle } from "@/components/document-title";
import { formatRepoBranchTitle } from "@/lib/document-title";
import { PendingChangesPanel } from "@/components/repo/pending-changes-panel";

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
        title={formatRepoBranchTitle("未提交更改", owner, repo, decodedBranch)}
      />
      <PendingChangesPanel />
    </>
  );
}
