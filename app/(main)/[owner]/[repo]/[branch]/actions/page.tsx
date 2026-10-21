import { DocumentTitle } from "@/components/document-title";
import { formatRepoBranchTitle } from "@/lib/document-title";
import { PublishHistoryPage } from "@/components/actions/publish-history-page";

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
        title={formatRepoBranchTitle("提交记录", owner, repo, decodedBranch)}
      />
      <div className="flex w-full flex-1 flex-col">
        <PublishHistoryPage
          owner={owner}
          repo={repo}
          branch={decodedBranch}
        />
      </div>
    </>
  );
}
