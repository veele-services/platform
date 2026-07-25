import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const formGridVariants = cva("grid grid-cols-1", {
  variants: {
    columns: {
      one: "",
      two: "sm:grid-cols-2",
      three: "sm:grid-cols-2 lg:grid-cols-3",
      four: "sm:grid-cols-2 lg:grid-cols-4",
    },
    gap: {
      compact: "gap-2",
      default: "gap-3",
      comfortable: "gap-4",
    },
  },
  defaultVariants: {
    columns: "two",
    gap: "default",
  },
})

function FormGrid({
  className,
  columns,
  gap,
  ...props
}: React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof formGridVariants>) {
  return (
    <div
      className={cn(formGridVariants({ columns, gap }), className)}
      {...props}
    />
  )
}

function FormGridItem({
  className,
  span = "one",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  span?: "one" | "full"
}) {
  return (
    <div
      className={cn(span === "full" && "col-span-full", className)}
      {...props}
    />
  )
}

export { FormGrid, FormGridItem, formGridVariants }
