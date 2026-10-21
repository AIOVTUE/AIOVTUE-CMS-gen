import { DocumentTitle } from "@/components/document-title";
import { formatRepoBranchTitle } from "@/lib/document-title";
import { Collection } from "@/components/collection/collection";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{
    owner: string;
    repo: string;
    branch: string;
    name: string;
  }>;
  searchParams: Promise<{ path?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearch = await searchParams;
  const name = decodeURIComponent(resolvedParams.name);
  const path = resolvedSearch.path || "";
  const decodedBranch = decodeURIComponent(resolvedParams.branch);

  return (
    <>
      <DocumentTitle
        title={formatRepoBranchTitle(
          name,
          resolvedParams.owner,
          resolvedParams.repo,
          decodedBranch,
        )}
      />
      <Collection name={name} path={path} />
    </>
  );
}
