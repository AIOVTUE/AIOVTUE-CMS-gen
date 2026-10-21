import { DocumentTitle } from "@/components/document-title";
import { formatRepoBranchTitle } from "@/lib/document-title";
import { Entry } from "@/components/entry/entry";
import { decodeRepoPathParam } from "@/lib/repo-href";

export default async function Page({
  params,
}: {
  params: Promise<{
    owner: string;
    repo: string;
    branch: string;
    name: string;
    path: string;
  }>;
}) {
  const resolvedParams = await params;
  const schemaName = decodeURIComponent(resolvedParams.name);
  const decodedPath = decodeRepoPathParam(resolvedParams.path);
  const filename = decodedPath.split("/").pop() || decodedPath;
  const decodedBranch = decodeURIComponent(resolvedParams.branch);

  return (
    <>
      <DocumentTitle
        title={formatRepoBranchTitle(
          `Edit ${filename} | ${schemaName}`,
          resolvedParams.owner,
          resolvedParams.repo,
          decodedBranch,
        )}
      />
      <Entry name={schemaName} path={decodedPath} />
    </>
  );
}
