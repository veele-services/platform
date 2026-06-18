export default function DashboardLoading() {
  return (
    <div className="space-y-4 p-4 md:p-0 animate-pulse">
      {/* Header skeleton */}
      <div
        className="rounded-3xl px-5 py-6"
        style={{ backgroundColor: "#E2E8F0", height: "136px" }}
      />

      {/* Quick tiles skeleton — 3 */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-white p-4 shadow-sm flex flex-col items-center gap-3"
          >
            <div className="rounded-xl" style={{ width: "44px", height: "44px", backgroundColor: "#E2E8F0" }} />
            <div className="rounded" style={{ width: "32px", height: "20px", backgroundColor: "#E2E8F0" }} />
            <div className="rounded" style={{ width: "52px", height: "12px", backgroundColor: "#F1F5F9" }} />
          </div>
        ))}
      </div>

      {/* Quick tiles skeleton — 2 */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-white p-4 shadow-sm flex flex-col items-center gap-3"
          >
            <div className="rounded-xl" style={{ width: "44px", height: "44px", backgroundColor: "#E2E8F0" }} />
            <div className="rounded" style={{ width: "48px", height: "20px", backgroundColor: "#E2E8F0" }} />
            <div className="rounded" style={{ width: "60px", height: "12px", backgroundColor: "#F1F5F9" }} />
          </div>
        ))}
      </div>

      {/* Vandaag skeleton */}
      <div className="rounded-3xl bg-white shadow-sm overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "#E2E8F0" }}
        >
          <div className="rounded" style={{ width: "64px", height: "20px", backgroundColor: "#E2E8F0" }} />
          <div className="rounded" style={{ width: "80px", height: "16px", backgroundColor: "#F1F5F9" }} />
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
            <div className="rounded-full shrink-0" style={{ width: "4px", height: "48px", backgroundColor: "#E2E8F0" }} />
            <div className="flex-1 space-y-2">
              <div className="rounded" style={{ width: "60%", height: "16px", backgroundColor: "#E2E8F0" }} />
              <div className="rounded" style={{ width: "40%", height: "12px", backgroundColor: "#F1F5F9" }} />
            </div>
            <div className="rounded-full" style={{ width: "64px", height: "22px", backgroundColor: "#E2E8F0" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
