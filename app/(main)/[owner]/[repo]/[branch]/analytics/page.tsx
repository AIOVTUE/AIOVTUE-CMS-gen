import { DocumentTitle } from "@/components/document-title";
import { formatRepoBranchTitle } from "@/lib/document-title";
import { AnalyticsPageClient } from "@/components/analytics/analytics-page-client";

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
        title={formatRepoBranchTitle("访问", owner, repo, decodedBranch)}
      />
      <AnalyticsPageClient />
    </>
  );
}
