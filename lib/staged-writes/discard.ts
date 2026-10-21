import "server-only";

import { isLocalRepoRef } from "@/lib/local-repo/config";
import { discardLocalChanges } from "@/lib/local-repo/git";
import {
  clearStagedWrites,
  getStagedWrite,
  listStagedWrites,
  removeStagedWrite,
  type RepoBranchRef,
} from "@/lib/staged-writes/store";

const discardStagedChanges = async (
  ref: RepoBranchRef,
  options?: { path?: string },
) => {
  if (isLocalRepoRef(ref.owner, ref.repo)) {
    return discardLocalChanges(ref, options);
  }

  if (options?.path) {
    const existing = await getStagedWrite(ref, options.path);
    if (!existing) {
      return { discarded: 0, paths: [] as string[] };
    }
    await removeStagedWrite(ref, options.path);
    return {
      discarded: 1,
      paths: [existing.newPath || existing.path],
    };
  }

  const rows = await listStagedWrites(ref);
  await clearStagedWrites(ref);
  return {
    discarded: rows.length,
    paths: rows.map((row) => row.newPath || row.path),
  };
};

export { discardStagedChanges };
