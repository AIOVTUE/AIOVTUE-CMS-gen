import { getSchemaByName } from "@/lib/schema";
import {
  getRootActions,
  getSchemaActions,
  type RepoActionConfig,
} from "@/lib/actions";

export const resolveAllowedRepoAction = (
  configObject: unknown,
  input: {
    name: string;
    workflow: string;
    contextKind: string;
    contextName?: string | null;
  },
): RepoActionConfig | undefined => {
  if (!configObject || typeof configObject !== "object") return undefined;

  const candidates: RepoActionConfig[] = [...getRootActions(configObject)];

  if (input.contextName) {
    const schema = getSchemaByName(configObject, input.contextName);
    if (schema) {
      const scope =
        input.contextKind === "entry"
          ? "entry"
          : input.contextKind === "collection"
            ? "collection"
            : undefined;
      candidates.push(...getSchemaActions(schema, scope));
    }
  }

  return candidates.find(
    (candidate) =>
      candidate.name === input.name && candidate.workflow === input.workflow,
  );
};
