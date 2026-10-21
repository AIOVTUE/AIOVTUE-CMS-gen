"use client";

import { ViewComponent as BooleanView } from "@/fields/core/boolean/view-component";
import { ViewComponent as DateView } from "@/fields/core/date/view-component";
import { ViewComponent as FileView } from "@/fields/core/file/view-component";
import { ViewComponent as ImageView } from "@/fields/core/image/view-component";
import { ViewComponent as ReferenceView } from "@/fields/core/reference/view-component";
import { ViewComponent as RichTextView } from "@/fields/core/rich-text/view-component";

const viewComponents: Record<string, React.ComponentType<any>> = {
  boolean: BooleanView,
  date: DateView,
  file: FileView,
  image: ImageView,
  reference: ReferenceView,
  "rich-text": RichTextView,
};

export { viewComponents };
