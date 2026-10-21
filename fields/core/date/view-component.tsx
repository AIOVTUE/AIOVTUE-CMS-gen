"use client";
import { format, isValid } from "date-fns";
import { Field } from "@/types/field";
import { CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toDate } from "./parse";

const ViewComponent = ({
  value,
  field
}: {
  value: string | string[],
  field: Field
}) => {
  if (!value) return null;

  const firstValue = Array.isArray(value) ? value[0] : value;
  if (firstValue == null || firstValue === "") return null;
  const extraValuesCount = Array.isArray(value) ? value.length - 1 : 0;
  const hasTime = Boolean(field.options?.time);
  const outputFormat = hasTime ? "MM-dd HH:mm" : "yyyy-MM-dd";

  const parsedDate = toDate(firstValue);
  if (!parsedDate || !isValid(parsedDate)) {
    console.warn(
      `Date for field '${field.name}' is saved in the wrong format or invalid: ${firstValue}.`,
    );
    return null;
  }

  const formatted = format(parsedDate, outputFormat);

  return (
    <span className="inline-flex items-center gap-x-1.5">
      <span className="hidden sm:inline-flex">
        <Badge variant="secondary">
          <CalendarIcon />
          {formatted}
        </Badge>
      </span>
      <span className="text-xs tabular-nums text-muted-foreground sm:hidden">
        {formatted}
      </span>
      {extraValuesCount > 0 && (
        <Badge variant="secondary" className="px-1">
          +{extraValuesCount}
        </Badge>
      )}
    </span>
  );
};

export { ViewComponent };
