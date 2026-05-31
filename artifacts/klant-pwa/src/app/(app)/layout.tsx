import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--color-muted)" }}>
      <main className="flex-1 pb-[calc(4rem+var(--safe-bottom))]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
