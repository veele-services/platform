import { Skeleton } from "@/components/ui/skeleton";

function LoadingStatus({ label }: { label: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-busy="true"
      className="min-h-full bg-background px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        {children}
      </div>
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <PageFrame>
      <LoadingStatus label="Dashboard laden…" />
      <div className="flex items-center justify-between gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-64 max-w-[70vw]" />
        </div>
        <Skeleton className="hidden h-11 w-40 sm:block" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </PageFrame>
  );
}

export function DataListPageSkeleton() {
  return (
    <PageFrame>
      <LoadingStatus label="Overzicht laden…" />
      <div className="grid gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-56 max-w-[70vw]" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[minmax(16rem,1fr)_12rem_12rem_auto]">
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <Skeleton className="h-12 rounded-none" />
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-4 gap-4 border-t border-border p-4"
          >
            <Skeleton className="h-5" />
            <Skeleton className="h-5" />
            <Skeleton className="h-5" />
            <Skeleton className="h-5" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36" />
        ))}
      </div>
    </PageFrame>
  );
}

export function DetailPageSkeleton() {
  return (
    <PageFrame>
      <LoadingStatus label="Dossier laden…" />
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
          <Skeleton className="size-14 rounded-full" />
          <div className="grid gap-2">
            <Skeleton className="h-8 w-72 max-w-[70vw]" />
            <Skeleton className="h-4 w-56 max-w-[60vw]" />
          </div>
          <Skeleton className="h-11 w-32" />
        </div>
      </section>
      <div className="flex gap-2 overflow-hidden border-y border-border py-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-32 shrink-0" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-[28rem]" />
        <Skeleton className="h-72" />
      </div>
    </PageFrame>
  );
}

export function PlanningPageSkeleton() {
  return (
    <PageFrame>
      <LoadingStatus label="Planbord laden…" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-2">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-4 w-72 max-w-[75vw]" />
        </div>
        <Skeleton className="h-11 w-40" />
      </div>
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-11" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Skeleton className="h-[34rem]" />
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Skeleton className="h-12 rounded-none" />
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="flex gap-3 border-t border-border p-3">
              <Skeleton className="h-14 w-48 shrink-0" />
              <Skeleton className="h-14 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
