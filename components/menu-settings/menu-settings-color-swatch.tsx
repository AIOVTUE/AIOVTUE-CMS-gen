"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_COLOR = "#64748b";

type MenuSettingsColorSwatchProps = {
  value?: string;
  onCommit: (color: string) => void;
  "aria-label"?: string;
  className?: string;
};

/**
 * Native color input with local state while dragging so parent trees
 * (dialogs / menu rows) are not re-rendered on every picker frame.
 */
function MenuSettingsColorSwatch({
  value,
  onCommit,
  "aria-label": ariaLabel = "图标颜色",
  className = "menu-settings__color-swatch",
}: MenuSettingsColorSwatchProps) {
  const normalized = value?.trim() || DEFAULT_COLOR;
  const [local, setLocal] = useState(normalized);
  const commitRef = useRef(onCommit);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  commitRef.current = onCommit;

  useEffect(() => {
    setLocal(normalized);
  }, [normalized]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const scheduleCommit = (next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      commitRef.current(next);
    }, 150);
  };

  const flushCommit = (next: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    commitRef.current(next);
  };

  return (
    <input
      type="color"
      className={className}
      value={local}
      aria-label={ariaLabel}
      onChange={(event) => {
        const next = event.target.value;
        setLocal(next);
        scheduleCommit(next);
      }}
      onBlur={() => flushCommit(local)}
      onPointerUp={() => flushCommit(local)}
    />
  );
}

export { MenuSettingsColorSwatch, DEFAULT_COLOR };
