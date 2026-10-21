import "server-only";

import fs from "node:fs";
import path from "node:path";
import { configVersion, normalizeConfig, parseConfig } from "@/lib/config";

const BUILTIN_SHA = "builtin";

const getBuiltinPagesYmlPath = () =>
  path.join(process.cwd(), "config", "builtin.pages.yml");

const readBuiltinPagesYml = (): string => {
  const filePath = getBuiltinPagesYmlPath();
  return fs.readFileSync(filePath, "utf8");
};

const getBuiltinConfigObject = () => {
  const raw = readBuiltinPagesYml();
  const parsed = parseConfig(raw);
  const object = parsed.document.toJSON() ?? {};
  // No default content templates — configure after selecting a project path.
  if (!Array.isArray(object.content)) object.content = [];
  return normalizeConfig(object);
};

const createBuiltinConfig = (owner: string, repo: string, branch: string) => ({
  owner: owner.toLowerCase(),
  repo: repo.toLowerCase(),
  branch,
  sha: BUILTIN_SHA,
  version: configVersion,
  object: getBuiltinConfigObject(),
});

const isBuiltinConfigSha = (sha?: string | null) => sha === BUILTIN_SHA;

export {
  BUILTIN_SHA,
  readBuiltinPagesYml,
  getBuiltinConfigObject,
  createBuiltinConfig,
  isBuiltinConfigSha,
};
