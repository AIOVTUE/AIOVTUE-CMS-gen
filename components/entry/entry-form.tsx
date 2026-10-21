"use client";

import {
  memo,
  useState,
  useMemo,
  useEffect,
  forwardRef,
  useCallback,
  useRef,
  useId,
} from "react";
import {
  useForm,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editComponents } from "@/fields/registry-edit";
import {
  initializeState,
  getDefaultValue,
  generateZodSchema,
  sanitizeObject,
} from "@/lib/schema";
import { Field } from "@/types/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  Ban,
  Asterisk,
  X,
  GripVertical,
  Plus,
  Trash2,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { interpolate } from "@/lib/schema";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const BlogEntryFormLayout = dynamic(
  () =>
    import("./entry-blog-form-layout").then((m) => m.BlogEntryFormLayout),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    ),
  },
);

type BeforeSubmitHookResult = void | Record<string, unknown>;
type BeforeSubmitHook = () => BeforeSubmitHookResult | Promise<BeforeSubmitHookResult>;
type RegisterBeforeSubmitHook = (
  key: string,
  hook: BeforeSubmitHook,
) => () => void;

type FieldWithReadonlyMeta = Field & {
  __inheritedReadonly?: boolean;
};

type RunBeforeSubmitHooks = () => Promise<Record<string, unknown>>;

type RenderFields = (
  fields: FieldWithReadonlyMeta[],
  parentName?: string,
  registerBeforeSubmitHook?: RegisterBeforeSubmitHook,
  runBeforeSubmitHooks?: RunBeforeSubmitHooks,
  inheritedReadonly?: boolean,
  keyPrefix?: string,
) => React.ReactNode[];

type NestedFieldProps = {
  field: FieldWithReadonlyMeta;
  fieldName: string;
  renderFields: RenderFields;
  registerBeforeSubmitHook?: RegisterBeforeSubmitHook;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  index?: number;
  keyPrefix?: string;
};

const hasFieldPathError = (errors: unknown, fieldName: string): boolean => {
  let current: unknown = errors;
  for (const part of fieldName.split(".")) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return Boolean(current);
};

const getCollapsibleItemLabel = (
  field: Field,
  fieldValues: unknown,
  index?: number,
): string => {
  if (
    typeof field.list === "object" &&
    field.list.collapsible &&
    typeof field.list.collapsible === "object" &&
    field.list.collapsible.summary
  ) {
    return interpolate(
      field.list.collapsible.summary,
      {
        index: index !== undefined ? `${index + 1}` : "",
        fields: fieldValues as Record<string, unknown>,
      },
      "fields",
    );
  }

  return `Item ${index !== undefined ? `#${index + 1}` : ""}`;
};

const hasCollapsibleSummary = (field: Field) =>
  typeof field.list === "object" &&
  !!field.list.collapsible &&
  typeof field.list.collapsible === "object" &&
  !!field.list.collapsible.summary;

const hasExplicitReadonly = (field: Field) =>
  Boolean(field.readonly) &&
  !(field as FieldWithReadonlyMeta).__inheritedReadonly;

const SortableItem = ({
  id,
  children,
  readonly = false,
}: {
  id: string;
  children: React.ReactNode;
  readonly?: boolean;
}) => {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-x-1",
        isDragging ? "opacity-50 z-50" : "z-10",
      )}
      style={style}
    >
      {!readonly && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-auto w-6 self-stretch cursor-move text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical />
        </Button>
      )}
      {children}
    </div>
  );
};

const ListItemRow = memo(function ListItemRow({
  id,
  field,
  fieldName,
  index,
  isOpen,
  defaultOpen,
  isPendingRemove,
  renderFields,
  registerBeforeSubmitHook,
  onToggleOpen,
  onRequestRemove,
  onRemoveConfirm,
  onPendingRemoveChange,
}: {
  id: string;
  field: FieldWithReadonlyMeta;
  fieldName: string;
  index: number;
  isOpen?: boolean;
  defaultOpen: boolean;
  isPendingRemove: boolean;
  renderFields: RenderFields;
  registerBeforeSubmitHook?: RegisterBeforeSubmitHook;
  onToggleOpen: (index: number) => void;
  onRequestRemove: (index: number) => void;
  onRemoveConfirm: (index: number) => void;
  onPendingRemoveChange: (index: number, open: boolean) => void;
}) {
  const isReadonly = Boolean(field.readonly);
  return (
    <SortableItem id={id} readonly={isReadonly}>
      <div className="grid gap-6 flex-1">
        <SingleField
          field={field}
          fieldName={`${fieldName}.${index}`}
          keyPrefix={id}
          renderFields={renderFields}
          registerBeforeSubmitHook={registerBeforeSubmitHook}
          showLabel={false}
          isOpen={isOpen ?? defaultOpen}
          toggleOpen={() => onToggleOpen(index)}
          index={index}
        />
      </div>
      {!isReadonly && (
        <Tooltip>
          <AlertDialog
            open={isPendingRemove}
            onOpenChange={(open) => onPendingRemoveChange(index, open)}
          >
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground self-start"
                  onClick={() => onRequestRemove(index)}
                >
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>移除此项？</AlertDialogTitle>
                <AlertDialogDescription>
                  此操作无法撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => onRemoveConfirm(index)}>
                  移除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <TooltipContent>移除该项</TooltipContent>
        </Tooltip>
      )}
    </SortableItem>
  );
});

const ListField = ({
  field,
  fieldName,
  renderFields,
  registerBeforeSubmitHook,
  runBeforeSubmitHooks,
}: {
  field: FieldWithReadonlyMeta;
  fieldName: string;
  renderFields: RenderFields;
  registerBeforeSubmitHook?: RegisterBeforeSubmitHook;
  runBeforeSubmitHooks?: RunBeforeSubmitHooks;
}) => {
  const supportsItemCollapse =
    field.type === "object" || field.type === "block";
  const isCollapsible = !!(
    supportsItemCollapse &&
    field.list &&
    !(typeof field.list === "object" && field.list?.collapsible === false)
  );
  const defaultOpen = useMemo(() => {
    const defaultCollapsed =
      isCollapsible &&
      typeof field.list === "object" &&
      field.list.collapsible &&
      typeof field.list.collapsible === "object" &&
      field.list.collapsible.collapsed;
    return !defaultCollapsed;
  }, [field.list, isCollapsible]);

  const {
    fields: arrayFields,
    append,
    remove,
    move,
  } = useFieldArray({
    name: fieldName,
  });
  const [openStates, setOpenStates] = useState<boolean[]>([]);
  const shouldShowListHeader =
    field.label !== false ||
    field.required ||
    (isCollapsible && arrayFields.length > 0);
  const isReadonly = Boolean(field.readonly);

  useEffect(() => {
    setOpenStates((prev) => {
      if (prev.length === arrayFields.length) {
        return prev;
      }
      if (prev.length === 0 && arrayFields.length > 0) {
        return Array(arrayFields.length).fill(defaultOpen);
      }
      if (prev.length < arrayFields.length) {
        return [
          ...prev,
          ...Array(arrayFields.length - prev.length).fill(defaultOpen),
        ];
      }
      return prev.slice(0, arrayFields.length);
    });
  }, [arrayFields.length, defaultOpen]);

  const toggleOpen = useCallback((index: number) => {
    setOpenStates((prev) =>
      prev.map((isOpen, currentIndex) =>
        currentIndex === index ? !isOpen : isOpen,
      ),
    );
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    if (isReadonly) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = arrayFields.findIndex((item) => item.id === active.id);
    const newIndex = arrayFields.findIndex((item) => item.id === over.id);

    if (oldIndex < 0 || newIndex < 0) return;

    await runBeforeSubmitHooks?.();
    setOpenStates((prev) => arrayMove(prev, oldIndex, newIndex));
    move(oldIndex, newIndex);
  };

  const addItem = async () => {
    if (isReadonly) return;
    await runBeforeSubmitHooks?.();
    append(
      field.type === "object"
        ? initializeState(field.fields, {})
        : getDefaultValue(field),
    );
    setOpenStates((prev) => [...prev, true]);
  };

  const removeItem = useCallback(
    async (index: number) => {
      if (isReadonly) return;
      await runBeforeSubmitHooks?.();
      remove(index);
      setOpenStates((prev) =>
        prev.filter((_, currentIndex) => currentIndex !== index),
      );
    },
    [isReadonly, remove, runBeforeSubmitHooks],
  );
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const modifiers = useMemo(
    () => [restrictToVerticalAxis, restrictToParentElement],
    [],
  );
  const sortableItems = useMemo(
    () => arrayFields.map((item) => item.id),
    [arrayFields],
  );

  const handleToggleOpen = useCallback(
    (index: number) => {
      toggleOpen(index);
    },
    [toggleOpen],
  );
  const handleRequestRemove = useCallback((index: number) => {
    setPendingRemoveIndex(index);
  }, []);
  const handlePendingRemoveChange = useCallback(
    (index: number, open: boolean) => {
      if (open) return;
      setPendingRemoveIndex((prev) => (prev === index ? null : prev));
    },
    [],
  );
  const handleRemoveConfirm = useCallback(
    (index: number) => {
      removeItem(index);
      setPendingRemoveIndex(null);
    },
    [removeItem],
  );

  const toggleAll = (collapsed: boolean) => {
    setOpenStates(Array(arrayFields.length).fill(!collapsed));
  };

  // We don't render <FormMessage/> in ListField, because it's already rendered in the individual fields
  return (
    <FormField
      name={fieldName}
      render={() => (
        <FormItem>
          {shouldShowListHeader && (
            <div className="flex items-center h-5 gap-x-2">
              {field.label !== false && (
                <FormLabel className="text-sm font-medium">
                  {field.label || field.name}
                </FormLabel>
              )}
              {field.required && (
                <Badge variant="secondary" className="text-muted-foreground">
                  <Asterisk className="-ml-1 -mr-0.5" />
                  必填
                </Badge>
              )}
              {hasExplicitReadonly(field) && (
                <Badge variant="secondary" className="text-muted-foreground">
                  <Ban className="-ml-0.5" />
                  只读
                </Badge>
              )}
              {isCollapsible &&
                arrayFields.length > 0 &&
                (() => {
                  const isAllExpanded =
                    openStates.length > 0 && openStates.every(Boolean);
                  return (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      onClick={() => toggleAll(isAllExpanded)}
                    >
                      {isAllExpanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
                      {isAllExpanded ? "全部折叠" : "全部展开"}
                    </Button>
                  );
                })()}
            </div>
          )}
          <div className="space-y-2">
            <DndContext
              sensors={sensors}
              modifiers={modifiers}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortableItems}
                strategy={verticalListSortingStrategy}
              >
                {arrayFields.map((arrayField, index) => (
                  <ListItemRow
                    key={arrayField.id}
                    id={arrayField.id}
                    field={field}
                    fieldName={fieldName}
                    index={index}
                    isOpen={openStates[index]}
                    defaultOpen={defaultOpen}
                    isPendingRemove={pendingRemoveIndex === index}
                    renderFields={renderFields}
                    registerBeforeSubmitHook={registerBeforeSubmitHook}
                    onToggleOpen={handleToggleOpen}
                    onRequestRemove={handleRequestRemove}
                    onRemoveConfirm={handleRemoveConfirm}
                    onPendingRemoveChange={handlePendingRemoveChange}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <div className="flex items-center gap-2 flex-wrap">
              {isReadonly ? null : typeof field.list === "object" &&
                field.list?.max &&
                arrayFields.length >= field.list.max ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                >
                  <Plus />
                  添加一项
                </Button>
              )}
            </div>
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );
};

const BlocksField = forwardRef<HTMLDivElement, NestedFieldProps>(
  (props, ref) => {
    const {
      field,
      fieldName,
      renderFields,
      registerBeforeSubmitHook,
      isOpen,
      onToggleOpen,
      index,
      keyPrefix,
    } = props;

    const isCollapsible = !!(
      field.list &&
      !(typeof field.list === "object" && field.list?.collapsible === false)
    );

    const {
      control,
      setValue,
      formState: { errors },
    } = useFormContext();

    const value = useWatch({ control, name: fieldName });
    const onChange = (val: Record<string, unknown> | null) => {
      setValue(fieldName, val, { shouldDirty: true });
    };

    const hasErrors = () => {
      return hasFieldPathError(errors, fieldName);
    };

    const { blocks = [] } = field;
    const blockKey = field.blockKey || "_block";
    const selectedBlockName = value?.[blockKey];
    const [isRemoveBlockDialogOpen, setIsRemoveBlockDialogOpen] =
      useState(false);
    const isReadonly = Boolean(field.readonly);

    const handleBlockSelect = (blockName: string) => {
      if (isReadonly) return;
      const selectedBlockDef = blocks.find((b: Field) => b.name === blockName);
      if (!selectedBlockDef) return;
      let initialState: Record<string, unknown> = { [blockKey]: blockName };
      if (selectedBlockDef.fields) {
        const choiceDefaults = initializeState(selectedBlockDef.fields, {});
        initialState = { ...initialState, ...choiceDefaults };
      }
      onChange(initialState);
    };

    const handleRemoveBlock = () => {
      if (isReadonly) return;
      onChange(null);
    };

    const selectedBlockDefinition = useMemo(() => {
      const definition = blocks.find(
        (b: Field) => b.name === selectedBlockName,
      );
      return definition;
    }, [blocks, selectedBlockName]);

    const itemLabel = getCollapsibleItemLabel(field, value, index);

    return (
      <div className="space-y-3" ref={ref as React.Ref<HTMLDivElement>}>
        {!selectedBlockDefinition ? (
          <div className="rounded-lg border p-4 space-y-4">
            <div className="text-sm">选择内容块：</div>
            <div className="flex flex-wrap gap-2">
              {blocks.map((blockDef: Field) => (
                <Button
                  key={blockDef.name}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-x-2"
                  onClick={() => handleBlockSelect(blockDef.name)}
                  disabled={isReadonly}
                >
                  {blockDef.label || blockDef.name}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="border rounded-lg">
            <header
              className={cn(
                "flex items-center gap-x-2 px-4 h-8.5 text-sm font-medium transition-colors rounded-t-lg",
                isOpen ? "" : "rounded-b-lg",
                isCollapsible ? "cursor-pointer hover:bg-muted" : "",
              )}
              onClick={isCollapsible ? onToggleOpen : undefined}
            >
              {isCollapsible && (
                <>
                  <ChevronRight
                    className={cn(
                      "size-4 transition-transform shrink-0",
                      isOpen ? "rotate-90" : "",
                    )}
                  />
                  <span
                    className={cn(
                      "truncate",
                      hasErrors() ? "text-destructive" : "",
                    )}
                  >
                    {itemLabel}
                  </span>
                </>
              )}
              <Badge
                className="text-muted-foreground ml-auto -mr-2"
                variant="outline"
              >
                {selectedBlockDefinition.label || selectedBlockDefinition.name}

                {!isReadonly && (
                  <Tooltip>
                    <AlertDialog
                      open={isRemoveBlockDialogOpen}
                      onOpenChange={setIsRemoveBlockDialogOpen}
                    >
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setIsRemoveBlockDialogOpen(true);
                            }}
                            className="text-muted-foreground hover:text-foreground -my-0.5 -mx-2 px-2 transition-colors"
                          >
                            <X className="size-3" />
                          </button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <AlertDialogContent
                        onClick={(event) => event.stopPropagation()}
                      >
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            移除此块？
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            此操作无法撤销。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              handleRemoveBlock();
                              setIsRemoveBlockDialogOpen(false);
                            }}
                          >
                            移除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <TooltipContent>移除块</TooltipContent>
                  </Tooltip>
                )}
              </Badge>
            </header>
            <div
              className={cn("p-4 grid gap-6 border-t", isOpen ? "" : "hidden")}
            >
              {selectedBlockDefinition.type === "object" ? (
                (() => {
                  const renderedElements = renderFields(
                    selectedBlockDefinition.fields || [],
                    fieldName,
                    registerBeforeSubmitHook,
                    undefined,
                    isReadonly,
                    keyPrefix,
                  );
                  return renderedElements;
                })()
              ) : (
                <SingleField
                  field={
                    isReadonly
                      ? {
                          ...selectedBlockDefinition,
                          readonly: true,
                          __inheritedReadonly: true,
                        }
                      : selectedBlockDefinition
                  }
                  fieldName={fieldName}
                  keyPrefix={keyPrefix}
                  renderFields={renderFields}
                  registerBeforeSubmitHook={registerBeforeSubmitHook}
                  showLabel={false}
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
);

BlocksField.displayName = "BlocksField";

const ObjectFieldSummaryLabel = ({
  field,
  fieldName,
  index,
}: {
  field: FieldWithReadonlyMeta;
  fieldName: string;
  index?: number;
}) => {
  const { control } = useFormContext();
  const fieldValues = useWatch({ control, name: fieldName });
  return <>{getCollapsibleItemLabel(field, fieldValues, index)}</>;
};

const ObjectField = forwardRef<HTMLDivElement, NestedFieldProps>(
  (props, ref) => {
    const {
      field,
      fieldName,
      renderFields,
      registerBeforeSubmitHook,
      isOpen = true,
      onToggleOpen = () => {},
      index,
      keyPrefix,
    } = props;

    const isCollapsible = !!(
      field.list &&
      !(typeof field.list === "object" && field.list?.collapsible === false)
    );

    const {
      formState: { errors },
    } = useFormContext();

    const hasErrors = () => {
      return hasFieldPathError(errors, fieldName);
    };

    const itemLabel = hasCollapsibleSummary(field) ? (
      <ObjectFieldSummaryLabel
        field={field}
        fieldName={fieldName}
        index={index}
      />
    ) : (
      `Item ${index !== undefined ? `#${index + 1}` : ""}`
    );

    return (
      <div className="border rounded-lg">
        {isCollapsible && (
          <header
            className={cn(
              "flex items-center gap-x-2 rounded-t-lg pl-4 pr-1 h-8.5 text-sm font-medium hover:bg-muted transition-colors cursor-pointer",
              isOpen ? "" : "rounded-b-lg",
            )}
            onClick={onToggleOpen}
          >
            <ChevronRight
              className={cn(
                "size-4 transition-transform",
                isOpen ? "rotate-90" : "",
              )}
            />
            <span className={hasErrors() ? "text-destructive" : ""}>
              {itemLabel}
            </span>
          </header>
        )}
        <div
          className={cn(
            "p-4 grid gap-6",
            isCollapsible && "border-t",
            isOpen ? "" : "hidden",
          )}
        >
          {renderFields(
            field.fields || [],
            fieldName,
            registerBeforeSubmitHook,
            undefined,
            Boolean(field.readonly),
            keyPrefix,
          )}
        </div>
      </div>
    );
  },
);

ObjectField.displayName = "ObjectField";

const SingleField = ({
  field,
  fieldName,
  renderFields,
  registerBeforeSubmitHook,
  onChangeRegistered,
  showLabel = true,
  isOpen = true,
  toggleOpen = () => {},
  index = 0,
  keyPrefix,
}: {
  field: FieldWithReadonlyMeta;
  fieldName: string;
  renderFields: RenderFields;
  registerBeforeSubmitHook?: RegisterBeforeSubmitHook;
  onChangeRegistered?: () => void;
  showLabel?: boolean;
  isOpen?: boolean;
  toggleOpen?: () => void;
  index?: number;
  keyPrefix?: string;
}) => {
  const {
    control,
    formState: { errors },
  } = useFormContext();
  const isRichTextField = field.type === "rich-text";
  const codeFormat = String(field.options?.format ?? "").toLowerCase();
  const isPreviewableCodeField =
    field.type === "code" &&
    (codeFormat === "" ||
      codeFormat === "md" ||
      codeFormat === "markdown" ||
      codeFormat === "mdx" ||
      codeFormat === "js" ||
      codeFormat === "jsx" ||
      codeFormat === "mjs" ||
      codeFormat === "cjs" ||
      codeFormat === "ts" ||
      codeFormat === "tsx" ||
      codeFormat === "javascript" ||
      codeFormat === "typescript" ||
      codeFormat === "json" ||
      codeFormat === "yaml" ||
      codeFormat === "yml");
  const externalLabelSlotId =
    typeof field.options?.labelSlotId === "string"
      ? field.options.labelSlotId
      : undefined;
  const blogInline = Boolean(field.options?.blogInline);
  const blogCheck = Boolean(field.options?.blogCheck);
  const blogAlignStart = field.options?.blogAlign === "start";
  const showEditorSwitcher =
    (isRichTextField || isPreviewableCodeField) &&
    field.options?.switcher !== false;
  const showInternalLabelSlot = showEditorSwitcher && !externalLabelSlotId;
  const shouldShowFieldMeta =
    showLabel &&
    (field.label !== false ||
      (!blogInline && !blogCheck && field.required) ||
      hasExplicitReadonly(field) ||
      showInternalLabelSlot);
  const rawLabelSlotId = useId();
  const labelSlotId = useMemo(
    () =>
      externalLabelSlotId ??
      `field-label-slot-${rawLabelSlotId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [externalLabelSlotId, rawLabelSlotId],
  );

  const isCollapsible = !!(
    field.list &&
    !(typeof field.list === "object" && field.list?.collapsible === false)
  );

  if (["object", "block"].includes(field.type)) {
    const hasErrors = () => hasFieldPathError(errors, fieldName);
    const NestedComponent = field.type === "block" ? BlocksField : ObjectField;

    return (
      <FormItem key={fieldName}>
        {shouldShowFieldMeta && (
          <div className="flex items-center h-5 gap-x-2">
            {field.label !== false && (
              <Label className={hasErrors() ? "text-destructive" : ""}>
                {field.label || field.name}
              </Label>
            )}
            {field.required && (
              <Badge variant="secondary" className="text-muted-foreground">
                <Asterisk className="-ml-1 -mr-0.5" />
                  必填
                </Badge>
            )}
            {hasExplicitReadonly(field) && (
              <Badge variant="secondary" className="text-muted-foreground">
                <Ban className="-ml-0.5" />
                  只读
                </Badge>
            )}
          </div>
        )}
        <NestedComponent
          field={field}
          fieldName={fieldName}
          keyPrefix={keyPrefix}
          renderFields={renderFields}
          registerBeforeSubmitHook={registerBeforeSubmitHook}
          isOpen={isOpen}
          onToggleOpen={isCollapsible ? toggleOpen : undefined}
          index={isCollapsible ? index : undefined}
        />
        {field.description && (
          <FormDescription>{field.description}</FormDescription>
        )}
      </FormItem>
    );
  } else {
    let FieldComponent;

    if (typeof field.type === "string" && editComponents[field.type]) {
      FieldComponent = editComponents[field.type];
    } else {
      console.warn(
        `No component found for field type: ${field.type}. Defaulting to 'text'.`,
      );
      FieldComponent = editComponents["text"];
    }

    return (
      <FormField
        name={fieldName}
        control={control}
        render={({ field: rhfManagedFieldProps }) => (
          <FormItem
            className={
              blogCheck
                ? "entry-blog-footer__check-item"
                : blogInline
                  ? "entry-blog-props__field gap-x-2 gap-y-1"
                  : undefined
            }
            data-blog-align={
              blogInline && blogAlignStart ? "start" : undefined
            }
            data-blog-label={
              blogInline &&
              (field.name === "tocStartLevel" || field.name === "tocEndLevel")
                ? "wrap"
                : undefined
            }
            data-blog-field={
              blogInline && field.name === "ai" ? "ai" : undefined
            }
          >
            {shouldShowFieldMeta &&
              (blogInline && field.name === "ai" ? (
                <div className="entry-blog-props__ai-meta">
                  <FormLabel
                    className="entry-blog-props__label--ai"
                    aria-label="AI摘要"
                  >
                    <span className="entry-blog-props__label--ai-en" aria-hidden>
                      <i>A</i>
                      <i>I</i>
                    </span>
                    <span className="entry-blog-props__label--ai-zh" aria-hidden>
                      摘要
                    </span>
                  </FormLabel>
                </div>
              ) : (
              <div
                className={
                  blogCheck
                    ? "contents"
                    : blogInline
                      ? "entry-blog-props__label-wrap"
                      : "flex min-h-6 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between"
                }
              >
                <div
                  className={
                    blogCheck || blogInline
                      ? "contents"
                      : "flex min-w-0 items-center gap-x-2"
                  }
                >
                  {field.label !== false && (
                    <FormLabel>{field.label || field.name}</FormLabel>
                  )}
                  {!blogInline && !blogCheck && field.required && (
                    <Badge
                      variant="secondary"
                      className="entry-blog-props__badge text-muted-foreground"
                    >
                      <Asterisk className="-ml-1 -mr-0.5" />
                  必填
                </Badge>
                  )}
                  {!blogInline && !blogCheck && hasExplicitReadonly(field) && (
                    <Badge
                      variant="secondary"
                      className="text-muted-foreground"
                    >
                      <Ban className="-ml-0.5" />
                  只读
                </Badge>
                  )}
                </div>
                {showInternalLabelSlot && (
                  <div
                    id={labelSlotId}
                    className="flex w-full shrink-0 justify-end sm:w-auto"
                  />
                )}
              </div>
              ))}
            <FormControl>
              {(() => {
                const sharedProps = {
                  ...rhfManagedFieldProps,
                  field,
                };
                if (field.type === "rich-text") {
                  return (
                    <FieldComponent
                      {...sharedProps}
                      labelSlotId={
                        showEditorSwitcher ? labelSlotId : undefined
                      }
                      registerBeforeSubmitHook={registerBeforeSubmitHook}
                      onChangeRegistered={onChangeRegistered}
                    />
                  );
                }
                if (field.type === "code" && showEditorSwitcher) {
                  return (
                    <FieldComponent
                      {...sharedProps}
                      labelSlotId={labelSlotId}
                    />
                  );
                }
                return <FieldComponent {...sharedProps} />;
              })()}
            </FormControl>
            {!blogInline && !blogCheck && field.description && (
              <FormDescription>{field.description}</FormDescription>
            )}
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }
};

SingleField.displayName = "SingleField";

const EntryForm = ({
  fields,
  contentObject,
  onSubmit = () => {},
  filePath,
  entryPath,
  collectionName,
  propsDefaultOpen,
  onDirtyChange,
  onChangeRegistered,
  layout = "default",
  rawFrontmatterProps = false,
  frontmatterRaw,
  friendLinksSourceRaw,
}: {
  fields: Field[];
  contentObject?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
  filePath?: React.ReactNode;
  entryPath?: string;
  collectionName?: string;
  propsDefaultOpen?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  onChangeRegistered?: () => void;
  layout?: "default" | "blog";
  /** Article template: edit frontmatter as raw YAML text. */
  rawFrontmatterProps?: boolean;
  frontmatterRaw?: string | null;
  /** Friend-links template: raw on-disk file text (YAML/JSON/JS). */
  friendLinksSourceRaw?: string | null;
}) => {
  const zodSchema = useMemo(() => {
    // Blog / raw YAML attributes may be left empty on create (title etc.).
    if (rawFrontmatterProps || layout === "blog") {
      return generateZodSchema(
        fields.map((field) =>
          field.name === "body" ? field : { ...field, required: false },
        ),
      );
    }
    return generateZodSchema(fields);
  }, [fields, rawFrontmatterProps, layout]);

  const defaultValues = useMemo(() => {
    return initializeState(fields, sanitizeObject(contentObject));
  }, [fields, contentObject]);

  const form = useForm({
    resolver: zodSchema && zodResolver(zodSchema),
    defaultValues,
    reValidateMode: "onSubmit",
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  // deepMap/initializeState only keeps schema fields — inject raw source separately.
  useEffect(() => {
    if (typeof friendLinksSourceRaw !== "string") return;
    form.setValue("__friendLinksSourceRaw", friendLinksSourceRaw, {
      shouldDirty: false,
      shouldTouch: false,
    });
  }, [defaultValues, form, friendLinksSourceRaw]);

  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);

  const beforeSubmitHooksRef = useRef<Map<string, BeforeSubmitHook>>(new Map());

  const registerBeforeSubmitHook = useCallback(
    (key: string, hook: BeforeSubmitHook) => {
      beforeSubmitHooksRef.current.set(key, hook);
      return () => {
        beforeSubmitHooksRef.current.delete(key);
      };
    },
    [],
  );

  const renderFields: RenderFields = useCallback(
    (
      fields: FieldWithReadonlyMeta[],
      parentName?: string,
      registerBeforeSubmitHook?: RegisterBeforeSubmitHook,
      runBeforeSubmitHooks?: RunBeforeSubmitHooks,
      inheritedReadonly = false,
      keyPrefix?: string,
    ): React.ReactNode[] => {
      return fields.map((field) => {
        if (!field || field.hidden) return null;
        const effectiveField =
          inheritedReadonly && !field.readonly
            ? { ...field, readonly: true, __inheritedReadonly: true }
            : field;
        const currentFieldName = parentName
          ? `${parentName}.${effectiveField.name}`
          : effectiveField.name;
        const currentFieldKey = keyPrefix
          ? `${keyPrefix}.${effectiveField.name}`
          : currentFieldName;

        if (
          effectiveField.list === true ||
          (typeof effectiveField.list === "object" &&
            effectiveField.list !== null)
        ) {
          return (
            <ListField
              key={currentFieldKey}
              field={effectiveField}
              fieldName={currentFieldName}
              renderFields={renderFields}
              registerBeforeSubmitHook={registerBeforeSubmitHook}
              runBeforeSubmitHooks={runBeforeSubmitHooks}
            />
          );
        }
        return (
          <SingleField
            key={currentFieldKey}
            field={effectiveField}
            fieldName={currentFieldName}
            keyPrefix={currentFieldKey}
            renderFields={renderFields}
            registerBeforeSubmitHook={registerBeforeSubmitHook}
            onChangeRegistered={onChangeRegistered}
          />
        );
      });
    },
    [onChangeRegistered],
  );

  const runBeforeValidationHooks = useCallback(async () => {
    const hooks = Array.from(beforeSubmitHooksRef.current.values());
    const extras: Record<string, unknown> = {};
    for (const hook of hooks) {
      const result = await hook();
      if (result && typeof result === "object") {
        Object.assign(extras, result);
      }
    }
    return extras;
  }, []);

  const submitExtrasRef = useRef<Record<string, unknown>>({});

  const handleSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      // Prefer resolver output (null → omitted via schema preprocess), then overlay
      // latest form values so before-submit hooks are included. Drop nulls so the
      // API never sees `Expected string, received null` for optional fields.
      const latestValues = form.getValues() as Record<string, unknown>;
      const merged: Record<string, unknown> = {
        ...values,
        ...latestValues,
        ...submitExtrasRef.current,
      };
      for (const key of Object.keys(merged)) {
        if (merged[key] === null) delete merged[key];
      }
      await onSubmit(merged);
    },
    [form, onSubmit],
  );

  const handleError = () => {
    toast.error("保存前请修正错误。", { duration: 5000 });
  };

  const handleFormSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      try {
        submitExtrasRef.current = await runBeforeValidationHooks();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "保存前请修正错误。",
          { duration: 5000 },
        );
        return;
      }
      await form.handleSubmit(handleSubmit, handleError)(event);
    },
    [form, handleSubmit, runBeforeValidationHooks],
  );

  return (
    <Form {...form}>
      <form
        id="entry-form"
        onSubmit={handleFormSubmit}
        className={cn(
          "w-full min-w-0 mx-auto grid items-start",
          layout === "blog"
            ? fields.some((field) => field.name === "linkGroups")
              ? "max-w-screen-xl gap-3"
              : "max-w-screen-lg gap-3"
            : "max-w-screen-md gap-4 sm:gap-6",
        )}
      >
        {layout !== "blog" && filePath && (
          <div className="min-w-0 space-y-2">
            <FormLabel>文件名</FormLabel>
            {filePath}
          </div>
        )}
        {layout === "blog" ? (
          <BlogEntryFormLayout
            fields={fields}
            collectionName={collectionName}
            renderFields={renderFields}
            registerBeforeSubmitHook={registerBeforeSubmitHook}
            runBeforeSubmitHooks={runBeforeValidationHooks}
            slugField={filePath}
            entryPath={entryPath}
            propsDefaultOpen={propsDefaultOpen}
            rawFrontmatterProps={rawFrontmatterProps}
            frontmatterRaw={frontmatterRaw}
            onChangeRegistered={onChangeRegistered}
          />
        ) : (
          renderFields(
            fields,
            undefined,
            registerBeforeSubmitHook,
            runBeforeValidationHooks,
          )
        )}
      </form>
    </Form>
  );
};

export { EntryForm };
