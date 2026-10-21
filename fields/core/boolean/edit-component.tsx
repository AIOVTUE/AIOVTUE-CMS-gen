"use client";

import { forwardRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  const { field, value, onChange, ...restProps } = props;
  const checked = Boolean(value);
  const useCheck = Boolean(field?.options?.blogCheck);

  if (useCheck) {
    return (
      <Checkbox
        {...restProps}
        ref={ref as React.Ref<HTMLButtonElement>}
        checked={checked}
        onCheckedChange={(next) => onChange(Boolean(next))}
        disabled={field?.readonly}
      />
    );
  }

  return (
    <div>
      <Switch
        {...restProps}
        ref={ref}
        checked={checked}
        onCheckedChange={onChange}
        disabled={field?.readonly}
      />
    </div>
  );
});

export { EditComponent };
