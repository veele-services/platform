import { BottomNav } from "@/components/BottomNav";
import { DesktopSidebar } from "@/components/DesktopSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen"
      style={{ backgroundColor: "var(--color-muted)" }}
    >
      {/* Desktop sidebar — hidden on mobile */}
      <DesktopSidebar />

      {/* Main content column */}
      <div className="flex flex-1 flex-col min-w-0">
        <main className="flex-1 pb-[calc(4rem+var(--safe-bottom))] md:pb-0">
          <div className="mx-auto w-full max-w-4xl px-0 md:px-6 md:py-6">
            {children}
          </div>
        </main>

        {/* Bottom nav — hidden on desktop */}
        <div className="md:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
