import { DocumentTitle } from "@/components/document-title";
import { formatRepoBranchTitle } from "@/lib/document-title";
import { MediaView } from "@/components/media/media-view";

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
    <div className="mx-auto flex h-full w-full max-w-screen-xl flex-1 flex-col">
      <DocumentTitle
        title={formatRepoBranchTitle(
          name,
          resolvedParams.owner,
          resolvedParams.repo,
          decodedBranch,
        )}
      />
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        <MediaView initialPath={path} media={name} />
      </div>
    </div>
  );
}
