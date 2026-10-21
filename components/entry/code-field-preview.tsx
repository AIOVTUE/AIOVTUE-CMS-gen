"use client";

import { useMemo } from "react";
import { MarkdownPreview } from "@/components/entry/markdown-preview";
import {
  inferFriendLinksFromParsed,
  normalizeFriendLinksDocument,
  parseFriendLinksSource,
} from "@/lib/friend-links-map";
import { splitFrontmatterSource } from "@/lib/serialization";
import "@/fields/core/friend-links/friend-links.css";

const MARKDOWN_FORMATS = new Set(["", "md", "markdown", "mdx"]);

const FRIEND_LINKS_CODE_FORMATS: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "javascript",
  tsx: "javascript",
  javascript: "javascript",
  typescript: "javascript",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
};

const isMarkdownFormat = (format?: string) =>
  MARKDOWN_FORMATS.has(String(format ?? "").toLowerCase());

const friendLinksParseFormat = (format?: string) =>
  FRIEND_LINKS_CODE_FORMATS[String(format ?? "").toLowerCase()] ?? null;

const markdownBodyForPreview = (source: string) => {
  const trimmed = source.replace(/^\uFEFF/, "");
  if (trimmed.trimStart().startsWith("+++")) {
    return splitFrontmatterSource(trimmed, { format: "toml-frontmatter" }).body;
  }
  return splitFrontmatterSource(trimmed, { format: "yaml-frontmatter" }).body;
};

type PreviewLink = {
  name: string;
  url: string;
  avatar: string;
  desc: string;
};

type PreviewGroup = {
  name: string;
  desc: string;
  links: PreviewLink[];
};

const toPreviewGroups = (source: string, parseFormat: string): PreviewGroup[] => {
  const parsed = parseFriendLinksSource(source, parseFormat);
  const inferred = inferFriendLinksFromParsed(parsed);
  const { document } = normalizeFriendLinksDocument(
    parsed,
    inferred.fieldMap,
    inferred.groupMap,
  );
  const groups = Array.isArray(document.linkGroups)
    ? (document.linkGroups as Array<Record<string, unknown>>)
    : [];

  return groups.map((group, index) => {
    const linksRaw = Array.isArray(group.links) ? group.links : [];
    const links: PreviewLink[] = linksRaw.map((item) => {
      const link = (item && typeof item === "object"
        ? item
        : {}) as Record<string, unknown>;
      const name = String(link.blog ?? link.name ?? "").trim() || "未命名";
      const url = String(link.url ?? "").trim();
      const avatar = String(link.avatar ?? "").trim();
      const desc = String(link.desc ?? "").trim();
      return { name, url, avatar, desc };
    });
    return {
      name: String(group.name ?? "").trim() || (groups.length > 1 ? `分组 ${index + 1}` : ""),
      desc: String(group.desc ?? "").trim(),
      links,
    };
  });
};

const FriendLinksCodePreview = ({
  source,
  parseFormat,
}: {
  source: string;
  parseFormat: string;
}) => {
  const result = useMemo(() => {
    try {
      const groups = toPreviewGroups(source, parseFormat);
      const total = groups.reduce((sum, group) => sum + group.links.length, 0);
      if (total === 0) {
        return { ok: false as const, message: "未解析到友链数据" };
      }
      return { ok: true as const, groups };
    } catch (error) {
      return {
        ok: false as const,
        message:
          error instanceof Error ? error.message : "无法解析友链源文件",
      };
    }
  }, [parseFormat, source]);

  if (!result.ok) {
    return (
      <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        {result.message}
      </div>
    );
  }

  return (
    <div className="cms-fl">
      <div className="cms-fl__groups">
        {result.groups.map((group, groupIndex) => (
          <section key={`preview-group-${groupIndex}`} className="cms-fl-group">
            {(group.name || group.desc) && (
              <header className="cms-fl-group__header">
                {group.name ? (
                  <div className="cms-fl-group__title-row">
                    <h3 className="cms-fl-group__title">
                      <span className="cms-fl-group__title-text">{group.name}</span>
                    </h3>
                  </div>
                ) : null}
                {group.desc ? (
                  <p className="cms-fl-group__desc">{group.desc}</p>
                ) : null}
              </header>
            )}
            <ul className="cms-fl-grid">
              {group.links.map((link, linkIndex) => {
                const card = (
                  <>
                    {link.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="cms-fl-avatar"
                        src={link.avatar}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="cms-fl-avatar" aria-hidden />
                    )}
                    <div className="cms-fl-text">
                      <div className="cms-fl-name">{link.name}</div>
                      <div className="cms-fl-desc">{link.desc || " "}</div>
                    </div>
                  </>
                );
                return (
                  <li key={`preview-link-${groupIndex}-${linkIndex}`}>
                    {link.url ? (
                      <a
                        className="cms-fl-card cms-fl-card--simple"
                        href={link.url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {card}
                      </a>
                    ) : (
                      <div className="cms-fl-card cms-fl-card--simple">{card}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
};

const CodeFieldPreview = ({
  source,
  format,
}: {
  source: string;
  format?: string;
}) => {
  if (isMarkdownFormat(format)) {
    return <MarkdownPreview markdown={markdownBodyForPreview(source)} />;
  }

  const parseFormat = friendLinksParseFormat(format);
  if (parseFormat) {
    return (
      <FriendLinksCodePreview source={source} parseFormat={parseFormat} />
    );
  }

  return (
    <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      此格式暂不支持预览
    </div>
  );
};

const isPreviewableCodeFormat = (format?: string) =>
  isMarkdownFormat(format) || Boolean(friendLinksParseFormat(format));

export { CodeFieldPreview, isPreviewableCodeFormat };
