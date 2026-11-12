"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { LIST_CONTAINER_VARIANTS, LIST_ITEM_VARIANTS, useMotionEnabled } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  hideHeaderOnMobile?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  data: readonly T[];
  columns: readonly DataTableColumn<T>[];
  keyExtractor: (row: T) => string;
  mobileTitle?: (row: T) => React.ReactNode;
  mobileSubtitle?: (row: T) => React.ReactNode;
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
  caption?: string;
  animated?: boolean;
  className?: string;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  mobileTitle,
  mobileSubtitle,
  emptyState,
  onRowClick,
  caption,
  animated = true,
  className,
}: DataTableProps<T>) {
  const motionEnabled = useMotionEnabled();

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop Table (>= 768px) */}
      <div
        data-testid="data-table-desktop"
        className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-border-subtle bg-surface shadow-[var(--shadow-sm)] md:block"
      >
        <table className="w-full border-collapse text-left text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="border-b border-border-subtle bg-surface-muted/70 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    "px-4 py-3 whitespace-nowrap",
                    column.align === "right" ? "text-right" : "text-left",
                    column.className
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          {animated && motionEnabled ? (
            <motion.tbody
              variants={LIST_CONTAINER_VARIANTS}
              initial="initial"
              animate="animate"
              className="divide-y divide-border-subtle"
            >
              {data.map((row) => {
                const rowKey = keyExtractor(row);
                return (
                  <motion.tr
                    key={rowKey}
                    variants={LIST_ITEM_VARIANTS}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      "transition-colors",
                      onRowClick &&
                        "cursor-pointer hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    )}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "px-4 py-3.5 align-middle text-text",
                          column.align === "right" ? "text-right" : "text-left",
                          column.className
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </motion.tr>
                );
              })}
            </motion.tbody>
          ) : (
            <tbody className="divide-y divide-border-subtle">
              {data.map((row) => {
                const rowKey = keyExtractor(row);
                return (
                  <tr
                    key={rowKey}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      "transition-colors",
                      onRowClick &&
                        "cursor-pointer hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    )}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "px-4 py-3.5 align-middle text-text",
                          column.align === "right" ? "text-right" : "text-left",
                          column.className
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>

      {/* Mobile Card List (< 768px) */}
      <div
        data-testid="data-table-mobile"
        className="flex flex-col gap-3 md:hidden"
        role="list"
        aria-label={caption ?? "Items list"}
      >
        {data.map((row) => {
          const rowKey = keyExtractor(row);
          const cardInner = (
            <div className="flex flex-col gap-3 p-4">
              {mobileTitle || mobileSubtitle ? (
                <div className="flex items-start justify-between gap-2 border-b border-border-subtle pb-2.5">
                  <div className="min-w-0 flex-1">
                    {mobileTitle ? (
                      <div className="font-semibold text-text">{mobileTitle(row)}</div>
                    ) : null}
                    {mobileSubtitle ? (
                      <div className="mt-0.5 text-xs text-text-muted">{mobileSubtitle(row)}</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
                {columns
                  .filter((col) => !col.hideHeaderOnMobile)
                  .map((column) => (
                    <div key={column.id} className="min-w-0">
                      <dt className="text-xs font-medium text-text-muted">{column.header}</dt>
                      <dd className="mt-0.5 truncate font-medium text-text">{column.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          );

          if (onRowClick) {
            return (
              <div key={rowKey} role="listitem">
                <button
                  type="button"
                  onClick={() => onRowClick(row)}
                  className="w-full min-h-11 rounded-[var(--radius-card)] border border-border-subtle bg-surface text-left shadow-[var(--shadow-sm)] transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  {cardInner}
                </button>
              </div>
            );
          }

          return (
            <Card key={rowKey} role="listitem">
              {cardInner}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
