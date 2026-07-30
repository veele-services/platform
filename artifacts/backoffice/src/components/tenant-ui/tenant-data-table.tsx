import * as React from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type TenantDataTableColumn<TData> = {
  id: string;
  header: React.ReactNode;
  cell: (row: TData, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
};

export interface TenantDataTableProps<TData> {
  rows: TData[];
  columns: TenantDataTableColumn<TData>[];
  getRowKey: (row: TData, index: number) => React.Key;
  caption?: React.ReactNode;
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  renderMobileCard?: (row: TData, index: number) => React.ReactNode;
  className?: string;
  tableClassName?: string;
  rowClassName?: string | ((row: TData, index: number) => string | undefined);
}

export function TenantDataTable<TData>({
  rows,
  columns,
  getRowKey,
  caption,
  emptyTitle = "Geen resultaten",
  emptyDescription = "Pas de filters aan of voeg nieuwe data toe.",
  renderMobileCard,
  className,
  tableClassName,
  rowClassName,
}: TenantDataTableProps<TData>) {
  if (rows.length === 0) {
    return (
      <Empty
        className={cn(
          "border border-dashed border-border bg-card shadow-card",
          className,
        )}
      >
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {renderMobileCard && (
        <div className="grid gap-3 md:hidden">
          {rows.map((row, index) => (
            <React.Fragment key={getRowKey(row, index)}>
              {renderMobileCard(row, index)}
            </React.Fragment>
          ))}
        </div>
      )}

      <div
        className={cn(
          "tenant-data-table max-w-full overflow-x-auto rounded-lg border border-border bg-card shadow-card",
          renderMobileCard && "hidden md:block",
        )}
      >
        <Table className={cn("min-w-full", tableClassName)}>
          {caption && <TableCaption>{caption}</TableCaption>}
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {columns.map((column) => (
                <TableHead key={column.id} className={column.headerClassName}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow
                key={getRowKey(row, index)}
                className={
                  typeof rowClassName === "function"
                    ? rowClassName(row, index)
                    : rowClassName
                }
              >
                {columns.map((column) => (
                  <TableCell key={column.id} className={column.className}>
                    {column.cell(row, index)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
