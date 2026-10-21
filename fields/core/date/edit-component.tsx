"use client";

import { forwardRef, useMemo, useState } from "react";
import { format, isValid, parse } from "date-fns";
import { zhCN } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toDate } from "./parse";

const DATE_ONLY = "yyyy-MM-dd";
const DATETIME_LOCAL = "yyyy-MM-dd'T'HH:mm";

const timeInputClassName = cn(
  "h-8 w-11 shrink-0 rounded-md border border-input bg-background px-1 text-center text-sm tabular-nums text-foreground shadow-xs outline-none",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const EditComponent = forwardRef((props: any, _ref: React.Ref<HTMLButtonElement>) => {
  const { field, value, onChange, onBlur, name } = props;
  const withTime = Boolean(field?.options?.time);
  const inputFormat = withTime ? DATETIME_LOCAL : DATE_ONLY;
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    if (!value) return undefined;
    const fromNative = toDate(value);
    if (fromNative) return fromNative;
    const parsed = parse(String(value), inputFormat, new Date());
    return isValid(parsed) ? parsed : undefined;
  }, [inputFormat, value]);

  const displayLabel = selected
    ? format(selected, withTime ? "yyyy年M月d日 HH:mm" : "yyyy年M月d日", {
        locale: zhCN,
      })
    : withTime
      ? "选择日期时间"
      : "选择日期";

  const minDate = field?.options?.min
    ? toDate(field.options.min) ?? undefined
    : undefined;
  const maxDate = field?.options?.max
    ? toDate(field.options.max) ?? undefined
    : undefined;

  const emitChange = (next: Date | undefined) => {
    if (!next || !isValid(next)) {
      onChange?.({
        target: { name, value: "" },
      });
      return;
    }
    onChange?.({
      target: { name, value: format(next, inputFormat) },
    });
  };

  const applyTime = (base: Date, hours: number, minutes: number) => {
    const next = new Date(base);
    next.setHours(
      clamp(hours, 0, 23),
      clamp(minutes, 0, 59),
      0,
      0,
    );
    emitChange(next);
  };

  const handleSelect = (day: Date | undefined) => {
    if (!day) {
      emitChange(undefined);
      return;
    }
    if (withTime && selected) {
      applyTime(day, selected.getHours(), selected.getMinutes());
    } else if (withTime) {
      const now = new Date();
      applyTime(day, now.getHours(), now.getMinutes());
    } else {
      emitChange(day);
      setOpen(false);
      onBlur?.();
    }
  };

  const hourValue = selected ? format(selected, "HH") : format(new Date(), "HH");
  const minuteValue = selected
    ? format(selected, "mm")
    : format(new Date(), "mm");

  const commitTimePart = (part: "hour" | "minute", raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const hours = part === "hour" ? parsed : Number(hourValue);
    const minutes = part === "minute" ? parsed : Number(minuteValue);
    applyTime(selected ?? new Date(), hours, minutes);
  };

  if (field?.readonly) {
    return (
      <Input
        readOnly
        value={displayLabel}
        className={cn(
          "w-auto text-base focus-visible:border-input focus-visible:ring-0",
        )}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          name={name}
          onBlur={onBlur}
          data-empty={!selected}
          className={cn(
            "entry-blog-date-trigger h-9 w-full min-w-0 justify-start gap-2 px-3 text-left text-base font-normal shadow-xs",
            !selected && "text-muted-foreground",
            field?.options?.blogInline && "text-[0.8125rem]",
          )}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-70" />
          <span className="min-w-0 truncate">{displayLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="entry-blog-date-popover w-auto border-border bg-popover p-0 shadow-lg"
      >
        <Calendar
          mode="single"
          locale={zhCN}
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={new Date(1990, 0)}
          endMonth={new Date(2100, 11)}
          disabled={[
            ...(minDate ? [{ before: minDate }] : []),
            ...(maxDate ? [{ after: maxDate }] : []),
          ]}
          onSelect={handleSelect}
        />
        {withTime && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">
            <span className="text-muted-foreground text-xs font-medium">时间</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={23}
                aria-label="小时"
                className={timeInputClassName}
                value={hourValue}
                onChange={(event) => commitTimePart("hour", event.target.value)}
              />
              <span className="text-muted-foreground w-2 text-center text-sm font-medium">
                :
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                aria-label="分钟"
                className={timeInputClassName}
                value={minuteValue}
                onChange={(event) => commitTimePart("minute", event.target.value)}
              />
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {!field?.required && selected && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    emitChange(undefined);
                    setOpen(false);
                    onBlur?.();
                  }}
                >
                  清除
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (!selected) {
                    applyTime(new Date(), Number(hourValue), Number(minuteValue));
                  }
                  setOpen(false);
                  onBlur?.();
                }}
              >
                确定
              </Button>
            </div>
          </div>
        )}
        {!withTime && !field?.required && selected && (
          <div className="flex justify-end border-t border-border px-3 py-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                emitChange(undefined);
                setOpen(false);
                onBlur?.();
              }}
            >
              清除
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});

EditComponent.displayName = "DateEditComponent";

export { EditComponent };
