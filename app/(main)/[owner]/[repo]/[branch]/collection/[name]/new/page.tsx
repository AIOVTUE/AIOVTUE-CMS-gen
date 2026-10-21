import { DocumentTitle } from "@/components/document-title";
import { formatRepoBranchTitle } from "@/lib/document-title";
import { Entry } from "@/components/entry/entry";

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
  searchParams: Promise<{ parent?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearch = await searchParams;
  const schemaName = decodeURIComponent(resolvedParams.name);
  const parent = resolvedSearch.parent || undefined;
  const decodedBranch = decodeURIComponent(resolvedParams.branch);

  return (
    <>
      <DocumentTitle
        title={formatRepoBranchTitle(
          `New entry | ${schemaName}`,
          resolvedParams.owner,
          resolvedParams.repo,
          decodedBranch,
        )}
      />
      <Entry name={schemaName} title="新建条目" parent={parent} />
    </>
  );
}
