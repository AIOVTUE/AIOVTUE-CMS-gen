export type PublishHistoryFile = {
  path: string;
  status: string;
};

export type PublishHistoryItem = {
  id: number;
  owner: string;
  repo: string;
  branch: string;
  commitSha: string | null;
  message: string | null;
  fileCount: number;
  files: PublishHistoryFile[];
  triggeredByUserId: string | null;
  triggeredByName: string | null;
  triggeredByEmail: string | null;
  triggeredByGithubUsername: string | null;
  createdAt: string;
};
