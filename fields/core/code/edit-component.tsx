"use client";

import {
  forwardRef,
  useEffect,
  useMemo,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
} from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";

/** Curated fenced-code langs for MD — avoids pulling @codemirror/language-data (~20 pkgs). */
const codeLanguages = [
  LanguageDescription.of({
    name: "JavaScript",
    alias: ["js", "javascript", "jsx", "ts", "tsx", "typescript"],
    extensions: ["js", "jsx", "ts", "tsx", "mjs", "cjs"],
    load: async () => javascript({ jsx: true }),
  }),
  LanguageDescription.of({
    name: "JSON",
    alias: ["json"],
    extensions: ["json"],
    load: async () => json(),
  }),
  LanguageDescription.of({
    name: "HTML",
    alias: ["html", "htm"],
    extensions: ["html", "htm"],
    load: async () => html(),
  }),
  LanguageDescription.of({
    name: "YAML",
    alias: ["yaml", "yml"],
    extensions: ["yaml", "yml"],
    load: async () =>
      new LanguageSupport(StreamLanguage.define(yaml)),
  }),
];
import { useTheme } from "next-themes";
import { linter } from "@codemirror/lint";
import { Skeleton } from "@/components/ui/skeleton";
import { isPreviewableCodeFormat } from "@/components/entry/code-field-preview";
import "./edit-component.css";

const CodeFieldPreview = dynamic(
  () =>
    import("@/components/entry/code-field-preview").then(
      (m) => m.CodeFieldPreview,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full" />,
  },
);

// TODO: implement minlength and maxlength

const EditComponent = forwardRef((props: any, ref: any) => {
  const { value, onChange, field, labelSlotId } = props;
  const { resolvedTheme } = useTheme();
  const format = field.options?.format as string | undefined;
  const showPreview =
    isPreviewableCodeFormat(format) && field.options?.switcher !== false;
  const [mode, setMode] = useState<"source" | "preview">("source");
  const [labelSlotEl, setLabelSlotEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!labelSlotId || typeof document === "undefined") {
      setLabelSlotEl(null);
      return;
    }
    setLabelSlotEl(document.getElementById(labelSlotId));
  }, [labelSlotId]);

  useEffect(() => {
    if (!showPreview && mode === "preview") setMode("source");
  }, [mode, showPreview]);

  const extensions = useMemo(() => {
    let exts = [EditorView.lineWrapping];

    switch (format) {
      case "yaml":
      case "yml":
        exts.push(StreamLanguage.define(yaml));
        break;
      case "mdx":
        exts.push(
          markdown({ base: markdownLanguage, codeLanguages }),
        );
        break;
      case "javascript":
      case "js":
      case "jsx":
      case "typescript":
      case "ts":
      case "tsx":
        exts.push(javascript({ jsx: true }));
        break;
      case "json":
        exts.push(json());
        break;
      case "html":
      case "htm":
        exts.push(html());
        break;
      default:
        exts.push(
          markdown({ base: markdownLanguage, codeLanguages }),
        );
        break;
    }

    if (field.options?.lintFn) {
      exts.push(linter(field.options.lintFn));
    }

    return exts;
  }, [format, field.options?.lintFn]);

  const switcherNode = showPreview ? (
    <button
      type="button"
      className="entry-blog-body__toggle"
      onClick={() =>
        setMode((current) => (current === "preview" ? "source" : "preview"))
      }
      data-active={mode === "preview" ? "true" : undefined}
    >
      {mode === "preview" ? "编辑" : "预览"}
    </button>
  ) : null;

  const source = typeof value === "string" ? value : "";

  return (
    <div className="entry-code-editor min-w-0 max-w-full space-y-2">
      {switcherNode &&
        labelSlotId &&
        labelSlotEl &&
        createPortal(
          <div className="flex items-center">{switcherNode}</div>,
          labelSlotEl,
        )}
      {switcherNode && !labelSlotId && (
        <div className="flex items-center justify-end">{switcherNode}</div>
      )}

      {mode === "preview" && showPreview ? (
        <CodeFieldPreview source={source} format={format} />
      ) : (
        <CodeMirror
          ref={ref}
          value={value ?? ""}
          height={
            typeof field.options?.maxHeight === "string"
              ? field.options.maxHeight
              : undefined
          }
          maxHeight={
            typeof field.options?.maxHeight === "string"
              ? field.options.maxHeight
              : undefined
          }
          basicSetup={{
            foldGutter: false,
            lineNumbers: false,
            highlightActiveLine: false,
            searchKeymap: false,
          }}
          extensions={extensions}
          onChange={onChange}
          theme={resolvedTheme === "dark" ? githubDark : githubLight}
          editable={!field?.readonly}
          readOnly={field?.readonly}
        />
      )}
    </div>
  );
});

export { EditComponent };
