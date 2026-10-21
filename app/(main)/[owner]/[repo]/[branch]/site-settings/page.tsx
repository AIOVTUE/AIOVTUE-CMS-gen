import { redirect } from "next/navigation";
import { repoHref } from "@/lib/repo-href";

export default async function Page(
  props: Readonly<{
    params: Promise<{ owner: string; repo: string; branch: string }>;
  }>,
) {
  const params = await props.params;
  redirect(repoHref(params.owner, params.repo, params.branch, "/configuration"));
}
