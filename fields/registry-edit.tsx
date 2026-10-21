"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { EditComponent as BooleanEdit } from "@/fields/core/boolean/edit-component";
import { EditComponent as NumberEdit } from "@/fields/core/number/edit-component";
import { EditComponent as SelectEdit } from "@/fields/core/select/edit-component";
import { EditComponent as StringEdit } from "@/fields/core/string/edit-component";
import { EditComponent as TextEdit } from "@/fields/core/text/edit-component";
import { EditComponent as UuidEdit } from "@/fields/core/uuid/edit-component";
import { EditComponent as ReferenceEdit } from "@/fields/core/reference/edit-component";

const editorSkeleton = (className: string) => (
  <Skeleton className={className} />
);

const CodeEdit = dynamic(
  () =>
    import("@/fields/core/code/edit-component").then((m) => m.EditComponent),
  { ssr: false, loading: () => editorSkeleton("h-48 w-full") },
);

const RichTextEdit = dynamic(
  () =>
    import("@/fields/core/rich-text/edit-component").then(
      (m) => m.EditComponent,
    ),
  { ssr: false, loading: () => editorSkeleton("h-64 w-full") },
);

const DateEdit = dynamic(
  () =>
    import("@/fields/core/date/edit-component").then((m) => m.EditComponent),
  { ssr: false, loading: () => editorSkeleton("h-10 w-full") },
);

const FileEdit = dynamic(
  () =>
    import("@/fields/core/file/edit-component").then((m) => m.EditComponent),
  { ssr: false, loading: () => editorSkeleton("h-32 w-full") },
);

const ImageEdit = dynamic(
  () =>
    import("@/fields/core/image/edit-component").then((m) => m.EditComponent),
  { ssr: false, loading: () => editorSkeleton("h-32 w-full") },
);

const FriendLinksEdit = dynamic(
  () =>
    import("@/fields/core/friend-links/edit-component").then(
      (m) => m.EditComponent,
    ),
  { ssr: false, loading: () => editorSkeleton("h-48 w-full") },
);

const editComponents: Record<string, React.ComponentType<any>> = {
  boolean: BooleanEdit,
  code: CodeEdit,
  date: DateEdit,
  file: FileEdit,
  "friend-links": FriendLinksEdit,
  image: ImageEdit,
  number: NumberEdit,
  reference: ReferenceEdit,
  "rich-text": RichTextEdit,
  select: SelectEdit,
  string: StringEdit,
  text: TextEdit,
  uuid: UuidEdit,
};

export { editComponents };
