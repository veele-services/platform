import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const formGridVariants = cva("grid grid-cols-1 gap-3", {
  variants: {
    columns: {
      one: "",
      two: "sm:grid-cols-2",
      three: "sm:grid-cols-2 lg:grid-cols-3",
      four: "sm:grid-cols-2 lg:grid-cols-4",
    },
  },
  defaultVariants: {
    columns: "two",
  },
})

function FormGrid({
  className,
  columns,
  ...props
}: React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof formGridVariants>) {
  return (
    <div
      className={cn(formGridVariants({ columns }), className)}
      {...props}
    />
  )
}

export { FormGrid, formGridVariants }
