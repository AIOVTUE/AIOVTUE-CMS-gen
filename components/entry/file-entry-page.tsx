"use client";

import Link from "next/link";
import { Entry } from "@/components/entry/entry";
import { useConfig } from "@/contexts/config-context";
import { getSchemaByName } from "@/lib/schema";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { repoHref } from "@/lib/repo-href";

/**
 * Resolve file-template schema from the layout ConfigProvider so soft
 * navigation never depends on a second server getConfig/notFound pass.
 */
export function FileEntryPage({ name }: { name: string }) {
  const { config } = useConfig();
  const schema = name ? getSchemaByName(config?.object, name) : null;
  const path =
    schema && typeof schema.path === "string" ? schema.path : "";

  if (!schema || schema.type !== "file" || !path) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>找不到文件页面</EmptyTitle>
          <EmptyDescription>
            未找到名为「{name}」的源文件/友链配置，或未设置文件路径。
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            className={buttonVariants({ variant: "default" })}
            href={
              config
                ? repoHref(
                    config.owner,
                    config.repo,
                    config.branch,
                    "/configuration",
                  )
                : "/"
            }
          >
            打开内容页面设置
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <Entry
      name={name}
      path={path}
      title={schema.label || schema.name || name}
    />
  );
}
