"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  useReactTable,
  RowData,
  ExpandedState,
  Row,
  type SortingState,
} from "@tanstack/react-table"
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Loader, CircleMinus, CirclePlus, Folder, FolderOpen } from "lucide-react";

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}

export type TableData = {
  name: string;
  path: string;
  sha?: string;
  content?: string;
  object?: Record<string, any>;
  type: "file" | "dir";
  isNode?: boolean;
  parentPath?: string;
  subRows?: TableData[];
  fields?: Record<string, any>;
}

const LShapeIcon = ({ className }: { className?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M4 4V11C4 12.0609 4.42143 13.0783 5.17157 13.8284C5.92172 14.5786 6.93913 15 8 15H20" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"/>
  </svg>
);

export function CollectionTable<TData extends TableData>({
  columns,
  data,
  initialState,
  search,
  setSearch,
  onExpand,
  pathname,
  path,
  isTree = false,
  flatList = false,
  primaryField,
  disableSorting = false,
}: {
  columns: any[],
  data: Record<string, any>[],
  initialState?: Record<string, any>,
  search: string,
  setSearch: (value: string) => void,
  onExpand: (row: any) => Promise<any>,
  pathname: string,
  path: string,
  isTree?: boolean,
  flatList?: boolean,
  primaryField?: string,
  /** Keep row order as provided (e.g. source-files authoring order). */
  disableSorting?: boolean,
}) {
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>(
    () => (initialState?.sorting as SortingState | undefined) ?? [],
  );

  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({});
  const loadingPathSetRef = useRef<Set<string>>(new Set());

  // Keep in sync when parent default sort changes (e.g. mobile breakpoint).
  const initialSortingKey = useMemo(
    () => JSON.stringify(initialState?.sorting ?? []),
    [initialState?.sorting],
  );
  useEffect(() => {
    setSorting((initialState?.sorting as SortingState | undefined) ?? []);
  }, [initialSortingKey, initialState?.sorting]);

  const handleRowExpansion = useCallback(async (row: Row<TData>) => {
    const needsLoading = row.getCanExpand() && !row.getIsExpanded() && row.original.subRows === undefined;
    const loadPath = row.original.isNode ? row.original.parentPath : row.original.path;

    if (needsLoading) {
      if (!loadPath) return;
      if (loadingPathSetRef.current.has(loadPath)) return;

      loadingPathSetRef.current.add(loadPath);
      setLoadingRows(prev => ({ ...prev, [row.id]: true }));
      try {
        await onExpand(row.original);
      } catch (error) {
        console.error("onExpand failed for row:", row.id, error);
        setLoadingRows(prev => {
          const newState = { ...prev };
          delete newState[row.id];
          return newState;
        });
        return;
      } finally {
        loadingPathSetRef.current.delete(loadPath);
        setLoadingRows(prev => {
          const newState = { ...prev };
          delete newState[row.id];
          return newState;
        });
      }
    }
    row.toggleExpanded();
  }, [onExpand]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(disableSorting ? {} : { getSortedRowModel: getSortedRowModel() }),
    initialState,
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: (row) =>
      !flatList && (row.original.isNode || row.original.type === "dir"),
    getSubRows: (row) => row.subRows,
    enableSorting: !disableSorting,
    enableSortingRemoval: false,
    enableMultiSort: false,
    state: {
      globalFilter: search,
      expanded,
      sorting: disableSorting ? [] : sorting,
    },
    onGlobalFilterChange: setSearch,
    onExpandedChange: setExpanded,
    onSortingChange: disableSorting ? undefined : setSorting,
  });

  const currentPage = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();

  const paginationItems = (() => {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, i) => i);
    }

    const pages = new Set<number>([0, pageCount - 1, currentPage]);
    if (currentPage - 1 >= 0) pages.add(currentPage - 1);
    if (currentPage + 1 < pageCount) pages.add(currentPage + 1);

    const ordered = Array.from(pages).sort((a, b) => a - b);
    const items: Array<number | "ellipsis"> = [];

    for (let i = 0; i < ordered.length; i += 1) {
      if (i > 0 && ordered[i] - ordered[i - 1] > 1) {
        items.push("ellipsis");
      }
      items.push(ordered[i]);
    }

    return items;
  })();

  useEffect(() => {
    if (!isTree) return;
    
    table.getRowModel().rows.forEach((row) => {
      if (
        !row.getIsExpanded() &&
        (
          (row.original.isNode && row.original.parentPath && path.startsWith(row.original.parentPath)) ||
          (row.original.type === "dir" && path.startsWith(row.original.path))
        )
      ) {
        handleRowExpansion(row as Row<TData>);
      }
    });
  }, [isTree, path, handleRowExpansion, table, data]);

  return (
    <div className="min-w-0 max-w-full space-y-2 overflow-x-clip">
      <Table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="sticky -top-3 z-20 bg-background hover:bg-background md:-top-6">
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-10 cursor-pointer select-none truncate border-b p-2 hover:bg-muted/50",
                      // Only the actions column is narrow — not whichever column happens to be last
                      // (fixed file lists end with「路径」, and last:w-10 was crushing it to 40px).
                      header.column.id === "actions" &&
                        "w-10 cursor-default hover:bg-background",
                      header.column.columnDef.meta?.className
                    )}
                    onClick={
                      header.column.getCanSort()
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                    title={
                      header.column.getCanSort()
                        ? header.column.getNextSortingOrder() === "asc"
                          ? "升序排列"
                          : "降序排列"
                        : undefined
                    }
                  >
                    <div
                      className={cn(
                        "flex items-center gap-x-2",
                        header.column.columnDef.meta?.className?.includes("text-center") &&
                          "justify-center",
                        header.column.columnDef.meta?.className?.includes("text-right") &&
                          "justify-end",
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      {{
                        asc: <ArrowUp className="h-4 w-4 opacity-50"/>,
                        desc: <ArrowDown className="h-4 w-4 opacity-50"/>,
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {
                  row.original.type === "dir" && !flatList
                    ? <>
                      <TableCell
                        colSpan={Math.max(columns.length - 1, 1)}
                        className="h-12 min-w-0 border-b p-2 py-0"
                        style={{
                          paddingLeft: row.depth > 0
                            ? `${Math.min(row.depth * 1.25, 2.5)}rem`
                            : undefined
                        }}
                      >
                        {isTree
                          ? <button
                              type="button"
                              className="flex w-full min-w-0 max-w-full items-center gap-x-2 text-left font-medium"
                              onClick={() => handleRowExpansion(row as Row<TData>)}
                            >
                              {loadingRows[row.id]
                                ? <Loader className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                                : row.getIsExpanded()
                                  ? <FolderOpen className="h-4 w-4 shrink-0 fill-[#ffc83d] text-[#e6a817] stroke-[1.75]" />
                                  : <Folder className="h-4 w-4 shrink-0 fill-[#ffc83d] text-[#e6a817] stroke-[1.75]" />
                              }
                              <span className="min-w-0 flex-1 truncate">{row.original.name}</span>
                            </button>
                          : <Link
                              className="flex w-full min-w-0 max-w-full items-center gap-x-2 font-medium"
                              href={`${pathname}?path=${encodeURIComponent(row.original.path)}`}
                            >
                              <Folder className="h-4 w-4 shrink-0 fill-[#ffc83d] text-[#e6a817] stroke-[1.75]" />
                              <span className="min-w-0 flex-1 truncate">{row.original.name}</span>
                            </Link>
                        }
                      </TableCell>
                      <TableCell className="h-12 w-10 shrink-0 border-b p-2 py-0">
                        {
                          (() => {
                            const lastCell = row.getVisibleCells()[row.getVisibleCells().length - 1];
                            return flexRender(lastCell.column.columnDef.cell, lastCell.getContext());
                          })()
                        }
                      </TableCell>
                      </>
                    : row.getVisibleCells().map((cell, index) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "h-12 min-w-0 whitespace-normal border-b p-2 py-0",
                          cell.column.columnDef.meta?.className,
                        )}
                        style={{
                          paddingLeft: (cell.column.id === primaryField && row.depth > 0)
                            ? `${Math.min(row.depth * 1.25, 2.5)}rem`
                            : undefined
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-x-1">
                          {row.depth > 0 && cell.column.id === primaryField && <LShapeIcon className="h-4 w-4 shrink-0 text-muted-foreground opacity-50"/>}
                          <div className="min-w-0 flex-1">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                          {isTree && row.getCanExpand() && cell.column.id === primaryField && (
                            loadingRows[row.id]
                              ? <Button variant="ghost" size="icon-sm" className="h-6 w-6 shrink-0 rounded-full" disabled>
                                  <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
                                </Button>
                              : <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-6 w-6 shrink-0 rounded-full"
                                  onClick={() => handleRowExpansion(row as Row<TData>)}
                                  disabled={row.getIsExpanded() && Array.isArray(row.original.subRows) && row.original.subRows.length === 0}
                                >
                                  {row.getIsExpanded() ? <CircleMinus className="text-muted-foreground hover:text-foreground h-4 w-4" /> : <CirclePlus className="text-muted-foreground hover:text-foreground h-4 w-4" />}
                                  <span className="sr-only">{row.getIsExpanded() ? 'Collapse row' : 'Expand row'}</span>
                                </Button>
                          )}
                        </div>
                      </TableCell>
                    ))
                }
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground text-sm p-6">
                <span>暂无条目</span>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {pageCount > 1 && (
        <footer className="flex items-center justify-center">
          <Pagination className="mx-0 w-auto justify-center">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  iconOnly
                  onClick={(event) => {
                    event.preventDefault();
                    if (table.getCanPreviousPage()) table.previousPage();
                  }}
                  className={!table.getCanPreviousPage() ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
              {paginationItems.map((item, index) => (
                <PaginationItem key={`${item}-${index}`}>
                  {item === "ellipsis" ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      href="#"
                      isActive={item === currentPage}
                      onClick={(event) => {
                        event.preventDefault();
                        table.setPageIndex(item);
                      }}
                    >
                      {item + 1}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  iconOnly
                  onClick={(event) => {
                    event.preventDefault();
                    if (table.getCanNextPage()) table.nextPage();
                  }}
                  className={!table.getCanNextPage() ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </footer>
      )}
    </div>
  )
}
