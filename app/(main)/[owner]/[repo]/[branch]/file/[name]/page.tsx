import { redirect } from "next/navigation";
import { DocumentTitle } from "@/components/document-title";
import { FileEntryPage } from "@/components/entry/file-entry-page";
import { formatRepoBranchTitle } from "@/lib/document-title";
import { repoHref } from "@/lib/repo-href";

export default async function Page({
  params,
}: {
  params: Promise<{
    owner: string;
    repo: string;
    branch: string;
    name: string;
  }>;
}) {
  const resolvedParams = await params;
  const name = decodeURIComponent(resolvedParams.name);
  const decodedBranch = decodeURIComponent(resolvedParams.branch);
  const decodedRepo = (() => {
    try {
      return decodeURIComponent(resolvedParams.repo);
    } catch {
      return resolvedParams.repo;
    }
  })();

  if (name === "site-config") {
    redirect(
      repoHref(
        resolvedParams.owner,
        decodedRepo,
        decodedBranch,
        "/configuration",
      ),
    );
  }

  return (
    <>
      <DocumentTitle
        title={formatRepoBranchTitle(
          name,
          resolvedParams.owner,
          decodedRepo,
          decodedBranch,
        )}
      />
      <FileEntryPage name={name} />
    </>
  );
}
