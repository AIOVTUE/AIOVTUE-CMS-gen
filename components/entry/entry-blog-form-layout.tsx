"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useFormContext, useController, useWatch } from "react-hook-form";
import { ChevronDown } from "lucide-react";
import YAML from "yaml";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { StreamLanguage } from "@codemirror/language";
import { yaml as yamlMode } from "@codemirror/legacy-modes/mode/yaml";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  BLOG_BODY_SWITCHER_SLOT_ID,
  BLOG_LINKS_TOOLBAR_SLOT_ID,
  BLOG_META_ROWS,
  blogFieldLabel,
  isWeeklyPostContext,
  splitBlogFields,
  withBlogInline,
} from "@/lib/entry-blog-layout";
import { EMPTY_EXCALIDRAW_JSON } from "@/lib/excalidraw-bundle";
import type { Field } from "@/types/field";
import "./entry-blog-body.css";
import "./entry-blog-props.css";
import "./entry-preview.css";

const GALLERY_POST_LAYOUT = "gallery-post";

type BeforeSubmitHookResult = void | Record<string, unknown>;
type BeforeSubmitHook = () => BeforeSubmitHookResult | Promise<BeforeSubmitHookResult>;

type BlogEntryFormLayoutProps = {
  fields: Field[];
  collectionName?: string;
  renderFields: (
    fields: Field[],
    parentName?: string,
    registerBeforeSubmitHook?: (
      key: string,
      hook: BeforeSubmitHook,
    ) => () => void,
    runBeforeSubmitHooks?: () => Promise<Record<string, unknown>>,
  ) => React.ReactNode[];
  registerBeforeSubmitHook: (
    key: string,
    hook: BeforeSubmitHook,
  ) => () => void;
  runBeforeSubmitHooks: () => Promise<Record<string, unknown>>;
  /** Filename / slug control from entry editor. */
  slugField?: ReactNode;
  /** Current entry path (cfBlog「路径」). */
  entryPath?: string;
  /**
   * Whether the「属性」fold starts open.
   * New entries / about: open; editing posts: collapsed.
   */
  propsDefaultOpen?: boolean;
  /** Article template: show frontmatter as raw YAML. */
  rawFrontmatterProps?: boolean;
  frontmatterRaw?: string | null;
  onChangeRegistered?: () => void;
};

const BlogRawFrontmatterEditor = ({
  initialRaw,
  fields,
  registerBeforeSubmitHook,
  onChangeRegistered,
}: {
  initialRaw: string;
  fields: Field[];
  registerBeforeSubmitHook: (
    key: string,
    hook: BeforeSubmitHook,
  ) => () => void;
  onChangeRegistered?: () => void;
}) => {
  const { setValue } = useFormContext();
  const { resolvedTheme } = useTheme();
  const [text, setText] = useState(initialRaw);

  // New entries have no raw frontmatter — leave attributes empty (do not
  // synthesize YAML from form defaults like date/tags).
  useEffect(() => {
    setText(initialRaw);
  }, [initialRaw]);

  const extensions = useMemo(
    () => [EditorView.lineWrapping, StreamLanguage.define(yamlMode)],
    [],
  );

  useEffect(() => {
    return registerBeforeSubmitHook("blog-frontmatter-raw", () => {
      let parsed: unknown;
      try {
        parsed = text.trim() ? YAML.parse(text) : {};
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "YAML 解析失败";
        throw new Error(`属性 YAML 无效：${message}`);
      }
      if (
        parsed == null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error("属性部分必须是 YAML 对象。");
      }
      const meta = parsed as Record<string, unknown>;
      for (const field of fields) {
        if (!field?.name || field.name === "body") continue;
        if (Object.prototype.hasOwnProperty.call(meta, field.name)) {
          setValue(field.name, meta[field.name], { shouldValidate: false });
        }
      }
      for (const [key, value] of Object.entries(meta)) {
        if (key === "body") continue;
        setValue(key, value, { shouldValidate: false });
      }
      setValue("__frontmatterRaw", text, { shouldValidate: false });
      return { __frontmatterRaw: text };
    });
  }, [fields, registerBeforeSubmitHook, setValue, text]);

  return (
    <div className="entry-blog-props__raw">
      <CodeMirror
        value={text}
        maxHeight="320px"
        basicSetup={{
          foldGutter: false,
          lineNumbers: true,
          highlightActiveLine: false,
          searchKeymap: false,
        }}
        extensions={extensions}
        onChange={(next) => {
          setText(next);
          onChangeRegistered?.();
        }}
        theme={resolvedTheme === "dark" ? githubDark : githubLight}
      />
    </div>
  );
};

const splitCommaList = (value: string) =>
  value
    .split(/[,，]/)
    .map((part) => part.trim())
    .filter(Boolean);

const joinCommaList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (item == null ? "" : String(item).trim()))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "string") return value;
  return "";
};

/** Normalize frontmatter string | string[] into a single text value. */
const toSingleText = (value: unknown) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item == null) continue;
      const text = String(item).trim();
      if (text) return text;
    }
    return "";
  }
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
};

/** cfBlog-style comma text input backed by a string[] field. */
const BlogCommaListField = ({
  name,
  label,
  placeholder,
  registerBeforeSubmitHook,
}: {
  name: string;
  label: string;
  placeholder?: string;
  registerBeforeSubmitHook: (
    key: string,
    hook: () => void | Promise<void>,
  ) => () => void;
}) => {
  const { control } = useFormContext();
  const { field } = useController({ name, control });
  const [text, setText] = useState(() => joinCommaList(field.value));

  useEffect(() => {
    setText(joinCommaList(field.value));
  }, [field.value]);

  useEffect(() => {
    return registerBeforeSubmitHook(`blog-comma-${name}`, () => {
      field.onChange(splitCommaList(text));
    });
  }, [field, name, registerBeforeSubmitHook, text]);

  return (
    <div className="entry-blog-props__field" data-slot="form-item">
      <span className="entry-blog-props__label" data-slot="form-label">
        {label}
      </span>
      <div data-slot="form-control">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            const next = splitCommaList(text);
            field.onChange(next);
            setText(joinCommaList(next));
            field.onBlur();
          }}
          placeholder={placeholder}
          className="text-base"
        />
      </div>
    </div>
  );
};

/** Single-value text field (e.g. categories — one only). */
const BlogSingleTextField = ({
  name,
  label,
  placeholder,
  registerBeforeSubmitHook,
}: {
  name: string;
  label: string;
  placeholder?: string;
  registerBeforeSubmitHook: (
    key: string,
    hook: () => void | Promise<void>,
  ) => () => void;
}) => {
  const { control } = useFormContext();
  const { field } = useController({ name, control });
  const [text, setText] = useState(() => toSingleText(field.value));

  useEffect(() => {
    setText(toSingleText(field.value));
  }, [field.value]);

  useEffect(() => {
    return registerBeforeSubmitHook(`blog-single-${name}`, () => {
      field.onChange(toSingleText(text));
    });
  }, [field, name, registerBeforeSubmitHook, text]);

  return (
    <div className="entry-blog-props__field" data-slot="form-item">
      <span className="entry-blog-props__label" data-slot="form-label">
        {label}
      </span>
      <div data-slot="form-control">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            const next = toSingleText(text);
            field.onChange(next);
            setText(next);
            field.onBlur();
          }}
          placeholder={placeholder}
          className="text-base"
        />
      </div>
    </div>
  );
};

const formatIssueDisplay = (value: unknown) => {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
};

const parseIssueInput = (raw: string) => {
  const text = raw.trim();
  if (text === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
};

/** Weekly issue number — manual entry; keeps value when toggling category. */
const BlogIssueField = ({ label }: { label: string }) => {
  const { control } = useFormContext();
  const issueValue = useWatch({ control, name: "issue" });
  const { field } = useController({
    name: "issue",
    control,
    shouldUnregister: false,
  });
  const [text, setText] = useState(() => formatIssueDisplay(issueValue));

  useEffect(() => {
    setText(formatIssueDisplay(issueValue));
  }, [issueValue]);

  return (
    <div className="entry-blog-props__field" data-slot="form-item">
      <span className="entry-blog-props__label" data-slot="form-label">
        {label}
      </span>
      <div data-slot="form-control">
        <Input
          type="number"
          min={1}
          step={1}
          placeholder="第几期周刊呢"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            const next = parseIssueInput(text);
            field.onChange(next);
            setText(formatIssueDisplay(next));
            field.onBlur();
          }}
          className="text-base"
        />
      </div>
    </div>
  );
};

const BlogStaticField = ({
  label,
  labelWrap = false,
  children,
}: {
  label: string;
  labelWrap?: boolean;
  children: ReactNode;
}) => (
  <div
    className="entry-blog-props__field gap-x-2 gap-y-1"
    data-slot="form-item"
    {...(labelWrap ? { "data-blog-label": "wrap" } : {})}
  >
    <div className="entry-blog-props__label-wrap">
      <span className="entry-blog-props__label" data-slot="form-label">
        {label}
      </span>
    </div>
    <div data-slot="form-control" className="min-w-0">
      {children}
    </div>
  </div>
);

/** Toggle writes layout: gallery-post (on) or clears layout (off). */
const BlogGalleryLayoutSwitch = () => {
  const { control } = useFormContext();
  const { field } = useController({ name: "layout", control });
  const checked = field.value === GALLERY_POST_LAYOUT;

  return (
    <div className="entry-blog-props__field" data-slot="form-item">
      <span className="entry-blog-props__label" data-slot="form-label">
        {blogFieldLabel("galleryPost")}
      </span>
      <div data-slot="form-control">
        <Switch
          checked={checked}
          onCheckedChange={(next) => {
            field.onChange(next ? GALLERY_POST_LAYOUT : "");
          }}
          onBlur={field.onBlur}
          ref={field.ref}
        />
      </div>
    </div>
  );
};

const BlogEntryFormLayout = ({
  fields,
  collectionName,
  renderFields,
  registerBeforeSubmitHook,
  runBeforeSubmitHooks,
  slugField,
  entryPath,
  propsDefaultOpen,
  rawFrontmatterProps = false,
  frontmatterRaw,
  onChangeRegistered,
}: BlogEntryFormLayoutProps) => {
  const split = splitBlogFields(fields);
  const { getValues, setValue, control } = useFormContext();
  const watchedCategories = useWatch({ control, name: "categories" });
  const isWeeklyPost =
    collectionName === "posts" &&
    isWeeklyPostContext(watchedCategories, entryPath);
  const [propsOpen, setPropsOpen] = useState(() => {
    if (typeof propsDefaultOpen === "boolean") return propsDefaultOpen;
    // Fallback: open for normal pages, closed for friend-links.
    return !split.linkGroups;
  });
  const [moreOpen, setMoreOpen] = useState(() => isWeeklyPost);

  const initialFrontmatterRaw = useMemo(() => {
    if (typeof frontmatterRaw === "string") return frontmatterRaw;
    return "";
  }, [frontmatterRaw]);

  useEffect(() => {
    if (isWeeklyPost) {
      setMoreOpen(true);
    }
  }, [isWeeklyPost]);

  useEffect(() => {
    if (collectionName !== "excalidraw") return;
    return registerBeforeSubmitHook("excalidraw-layout", () => {
      setValue("layout", "excalidraw", { shouldDirty: false });
    });
  }, [collectionName, registerBeforeSubmitHook, setValue]);

  useEffect(() => {
    if (collectionName !== "posts") return;
    return registerBeforeSubmitHook("weekly-issue", () => {
      if (!isWeeklyPostContext(getValues("categories"), entryPath)) {
        setValue("issue", undefined, { shouldDirty: true });
      }
    });
  }, [collectionName, entryPath, getValues, registerBeforeSubmitHook, setValue]);

  const renderOne = (field: Field) =>
    renderFields(
      [field],
      undefined,
      registerBeforeSubmitHook,
      runBeforeSubmitHooks,
    )[0];

  const renderSchemaField = (field: Field) => {
    const label = blogFieldLabel(field.name, field.label);
    const isList =
      field.list === true ||
      (typeof field.list === "object" && field.list !== null);

    if (field.name === "categories") {
      return (
        <BlogSingleTextField
          key={field.name}
          name={field.name}
          label={label}
          placeholder="填写一个分类"
          registerBeforeSubmitHook={registerBeforeSubmitHook}
        />
      );
    }

    if (field.name === "issue") {
      return (
        <div key={field.name} className="entry-blog-props__cell min-w-0">
          <BlogIssueField label={label} />
        </div>
      );
    }

    if (field.name === "tags" && isList) {
      return (
        <BlogCommaListField
          key={field.name}
          name={field.name}
          label={label}
          placeholder="多个用逗号分隔"
          registerBeforeSubmitHook={registerBeforeSubmitHook}
        />
      );
    }

    const patched = withBlogInline(
      {
        ...field,
        options: {
          ...(field.options ?? {}),
          ...(field.name === "cover" ? { placeholder: "https://..." } : {}),
          ...(field.name === "ai"
            ? {
                blogAlign: "start",
                placeholder:
                  "文章顶部 AI 摘要，可留空；开启自动生成后保存时会补写",
              }
            : {}),
        },
      },
      label,
    );

    return (
      <div key={field.name} className="entry-blog-props__cell min-w-0">
        {renderOne(patched)}
      </div>
    );
  };

  /** About/pages: put「布局」where Slug would be when there is no filename field. */
  const layoutInSlugSlot =
    !slugField && Boolean(split.byName.get("layout"));

  const renderSlot = (slot: string) => {
    if (slot === "slug") {
      if (slugField) {
        return (
          <div key="slug" className="entry-blog-props__cell min-w-0">
            <BlogStaticField
              label={
                collectionName === "excalidraw"
                  ? "文件夹名"
                  : blogFieldLabel("slug")
              }
              labelWrap={collectionName === "excalidraw"}
            >
              {slugField}
            </BlogStaticField>
          </div>
        );
      }
      const layoutField = split.byName.get("layout");
      if (layoutField) return renderSchemaField(layoutField);
      return null;
    }
    if (slot === "path") {
      return (
        <div key="path" className="entry-blog-props__cell min-w-0">
          <BlogStaticField label={blogFieldLabel("path")}>
            <Input
              value={entryPath || ""}
              readOnly
              placeholder="保存后显示路径"
              className="text-base"
            />
          </BlogStaticField>
        </div>
      );
    }

    const field = split.byName.get(slot);
    if (!field) return null;
    return renderSchemaField(field);
  };

  /** Posts only: layout is the gallery-mode switch, not a free-text field. */
  const galleryLayoutField =
    collectionName === "posts" &&
    Boolean(slugField) &&
    Boolean(split.byName.get("layout"));

  const visibleMetaSwitches =
    collectionName === "excalidraw"
      ? split.metaSwitches.filter((field) => field.name !== "math")
      : split.metaSwitches;

  const bodyField = split.body
    ? ({
        ...split.body,
        label: false,
        options: {
          ...(split.body.options ?? {}),
          ...(split.body.type === "rich-text"
            ? {
                labelSlotId: BLOG_BODY_SWITCHER_SLOT_ID,
                blogToggle: true,
              }
            : {}),
          ...(collectionName === "excalidraw"
            ? { maxHeight: "320px" }
            : {}),
        },
      } satisfies Field)
    : undefined;

  /** Friend-links file editor: only the links body — no props fold / footer checks. */
  const isFriendLinksOnly = Boolean(split.linkGroups) && !split.body;

  const hasProps =
    !isFriendLinksOnly &&
    (rawFrontmatterProps
      ? true
      : Boolean(split.byName.get("title")) ||
        Boolean(slugField) ||
        Boolean(split.byName.get("date")) ||
        Boolean(split.byName.get("cover")) ||
        (Boolean(split.metaAi) && collectionName !== "excalidraw") ||
        visibleMetaSwitches.length > 0 ||
        galleryLayoutField ||
        Boolean(split.byName.get("categories")) ||
        Boolean(split.byName.get("tags")) ||
        split.metaExtra.length > 0 ||
        split.metaRest.length > 0);

  const footerFields = isFriendLinksOnly ? [] : split.footer;

  return (
    <div className="entry-blog-editor">
      {hasProps && (
        <details
          className="entry-blog-props group"
          open={propsOpen}
          onToggle={(event) => {
            setPropsOpen(event.currentTarget.open);
          }}
        >
          <summary className="entry-blog-props__summary">
            <span>属性</span>
            <ChevronDown className="entry-blog-props__chevron" aria-hidden />
          </summary>
          <div className="entry-blog-props__body">
            {rawFrontmatterProps ? (
              <>
                {(slugField || entryPath) && (
                  <div className="entry-blog-props__row">
                    {slugField ? (
                      <div className="entry-blog-props__cell min-w-0">
                        <BlogStaticField label={blogFieldLabel("slug")}>
                          {slugField}
                        </BlogStaticField>
                      </div>
                    ) : null}
                    {entryPath ? (
                      <div className="entry-blog-props__cell min-w-0">
                        <BlogStaticField label={blogFieldLabel("path")}>
                          <Input
                            value={entryPath}
                            readOnly
                            placeholder="保存后显示路径"
                            className="text-base"
                          />
                        </BlogStaticField>
                      </div>
                    ) : null}
                  </div>
                )}
                <BlogRawFrontmatterEditor
                  initialRaw={initialFrontmatterRaw}
                  fields={fields}
                  registerBeforeSubmitHook={registerBeforeSubmitHook}
                  onChangeRegistered={onChangeRegistered}
                />
              </>
            ) : (
              <>
            {BLOG_META_ROWS.slice(0, 2).map((row) => {
              const cells = row.map((slot) => renderSlot(slot)).filter(Boolean);
              if (cells.length === 0) return null;
              return (
                <div
                  key={row.join("-")}
                  className="entry-blog-props__row"
                >
                  {cells}
                </div>
              );
            })}

            {BLOG_META_ROWS.slice(2, 3).map((row) => {
              const cells = row.map((slot) => renderSlot(slot)).filter(Boolean);
              if (cells.length === 0) return null;
              return (
                <div
                  key={row.join("-")}
                  className="entry-blog-props__row"
                >
                  {cells}
                </div>
              );
            })}

            {split.metaAi && collectionName !== "excalidraw" && (
              <div className="entry-blog-props__cell min-w-0">
                {renderOne(
                  withBlogInline(
                    {
                      ...split.metaAi,
                      options: {
                        ...(split.metaAi.options ?? {}),
                        blogAlign: "start",
                        placeholder:
                          "文章顶部 AI 摘要，可留空；开启自动生成后保存时会补写",
                      },
                    },
                    blogFieldLabel("ai", split.metaAi.label),
                  ),
                )}
              </div>
            )}

            {(() => {
              const row = BLOG_META_ROWS[3];
              const cells = row.map((slot) => renderSlot(slot)).filter(Boolean);
              if (cells.length === 0) return null;
              return (
                <div key={row.join("-")} className="entry-blog-props__row">
                  {cells}
                </div>
              );
            })()}

            {(() => {
              const extra = split.metaExtra.filter(
                (field) =>
                  !(layoutInSlugSlot && field.name === "layout") &&
                  !(galleryLayoutField && field.name === "layout"),
              );
              const hasSwitches =
                visibleMetaSwitches.length > 0 || galleryLayoutField;
              const weeklyFields =
                isWeeklyPost && split.metaWeekly.length > 0
                  ? split.metaWeekly
                  : [];
              const extraCells: ReactNode[] = [];
              let issuePlaced = false;
              for (const field of extra) {
                extraCells.push(renderSchemaField(field));
                if (field.name === "lastmod" && weeklyFields.length > 0) {
                  weeklyFields.forEach((weeklyField) => {
                    extraCells.push(renderSchemaField(weeklyField));
                  });
                  issuePlaced = true;
                }
              }
              if (!issuePlaced && weeklyFields.length > 0) {
                weeklyFields.forEach((weeklyField) => {
                  extraCells.push(renderSchemaField(weeklyField));
                });
              }
              if (
                extraCells.length === 0 &&
                split.metaRest.length === 0 &&
                !hasSwitches
              ) {
                return null;
              }
              return (
                <details
                  className="entry-blog-props-more"
                  open={moreOpen}
                  onToggle={(event) => {
                    setMoreOpen(event.currentTarget.open);
                  }}
                >
                  <summary className="entry-blog-props-more__summary">
                    <span>更多</span>
                    <ChevronDown
                      className="entry-blog-props__chevron"
                      aria-hidden
                    />
                  </summary>
                  <div className="entry-blog-props-more__body">
                    {(extraCells.length > 0 || split.metaRest.length > 0) && (
                      <div className="entry-blog-props__row">
                        {extraCells}
                        {split.metaRest.map((field) => renderSchemaField(field))}
                      </div>
                    )}
                    {hasSwitches && (
                      <div className="entry-blog-props__row entry-blog-props__row--switches">
                        {visibleMetaSwitches.map((field) =>
                          renderSchemaField(field),
                        )}
                        {galleryLayoutField && (
                          <div
                            key="gallery-layout"
                            className="entry-blog-props__cell min-w-0"
                          >
                            <BlogGalleryLayoutSwitch />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </details>
              );
            })()}
              </>
            )}
          </div>
        </details>
      )}

      {bodyField &&
        (collectionName === "excalidraw" ? (
          <details className="entry-blog-body entry-blog-body--fold" open>
            <summary className="entry-blog-body__summary">
              <span>画板 JSON</span>
              <ChevronDown className="entry-blog-body__chevron" aria-hidden />
            </summary>
            <div className="entry-blog-body__content">{renderOne(bodyField)}</div>
          </details>
        ) : (
          <div className="entry-blog-body">
            <div className="entry-blog-body__head">
              <span className="entry-blog-body__title">正文</span>
              {split.body?.type === "rich-text" ? (
                <div
                  id={BLOG_BODY_SWITCHER_SLOT_ID}
                  className="entry-blog-body__toggle-slot"
                />
              ) : null}
            </div>
            <div className="entry-blog-body__content">{renderOne(bodyField)}</div>
          </div>
        ))}

      {split.linkGroups && (
        <div className="entry-blog-body entry-blog-links">
          <div className="entry-blog-body__head">
            <span className="entry-blog-body__title">友链</span>
            <div
              id={BLOG_LINKS_TOOLBAR_SLOT_ID}
              className="entry-blog-body__toggle-slot"
            />
          </div>
          <div className="entry-blog-body__content">
            {renderOne({
              ...split.linkGroups,
              label: false,
            })}
          </div>
        </div>
      )}

      {footerFields.length > 0 && (
        <div className="entry-blog-footer">
          <div className="entry-blog-footer__checks">
            {footerFields.map((field) => (
              <div key={field.name} className="entry-blog-footer__check">
                {renderOne({
                  ...field,
                  label: blogFieldLabel(field.name, field.label),
                  options: {
                    ...(field.options ?? {}),
                    blogCheck: true,
                  },
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export { BlogEntryFormLayout };
