import type { User } from "@/types/user";
import { getLocalRepoRef } from "@/lib/local-repo/config";

const LOCAL_DEV_USER: User = {
  id: "local-dev-user",
  name: "本地开发",
  email: "dev@local.pagescms",
  emailVerified: true,
  githubUsername: "local-dev",
  image: null,
};

const getLocalDevUser = (): User & {
  accounts: Array<{
    login: string;
    type: string;
    repositorySelection: string;
    installationId: number;
  }>;
  isAdmin: boolean;
} => {
  const { owner } = getLocalRepoRef();

  return {
    ...LOCAL_DEV_USER,
    isAdmin: true,
    accounts: [
      {
        login: owner,
        type: "user",
        repositorySelection: "all",
        installationId: 1,
      },
    ],
  };
};

export { LOCAL_DEV_USER, getLocalDevUser };
