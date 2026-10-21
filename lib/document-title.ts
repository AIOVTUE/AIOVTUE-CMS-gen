const APP_TITLE = "AIOVTUE";

export const formatDocumentTitle = (title?: string | null) =>
  title ? `${title} | ${APP_TITLE}` : APP_TITLE;

export const formatRepoBranchTitle = (
  title: string,
  owner: string,
  repo: string,
  branch?: string,
) => {
  const repoRef = `${owner}/${repo}${branch ? `@${branch}` : ""}`;
  return `${title} | ${repoRef}`;
};

export { APP_TITLE };
