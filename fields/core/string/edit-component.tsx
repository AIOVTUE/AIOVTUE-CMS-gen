"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLTextAreaElement>) => {
  const { field, ...restProps } = props;
  return <Input {...restProps} ref={ref} placeholder={field?.options?.placeholder} className={cn("text-base", field?.readonly && "focus-visible:border-input focus-visible:ring-0")} readOnly={field?.readonly} />;
});

export { EditComponent };
