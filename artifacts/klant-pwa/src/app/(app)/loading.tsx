export default function DashboardLoading() {
  return (
    <div className="space-y-5 p-4 md:p-0 animate-pulse">
      {/* Welkomstbanner skeleton */}
      <div
        className="rounded-3xl"
        style={{ backgroundColor: "#DBEAFE", height: "152px" }}
      />

      {/* Snelkoppelingen skeleton */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-white p-4 shadow-sm flex flex-col items-center gap-3"
          >
            <div className="rounded-xl" style={{ width: "44px", height: "44px", backgroundColor: "#DBEAFE" }} />
            <div className="rounded" style={{ width: "56px", height: "12px", backgroundColor: "#E2E8F0" }} />
          </div>
        ))}
      </div>

      {/* Recente opdrachten skeleton */}
      <div className="rounded-3xl bg-white shadow-sm overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "#E2E8F0" }}
        >
          <div className="rounded" style={{ width: "120px", height: "20px", backgroundColor: "#E2E8F0" }} />
          <div className="rounded" style={{ width: "60px", height: "16px", backgroundColor: "#F1F5F9" }} />
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 px-4 py-3 border-b"
            style={{ borderColor: "#F1F5F9" }}
          >
            <div className="flex-1 space-y-2">
              <div className="rounded" style={{ width: "55%", height: "16px", backgroundColor: "#E2E8F0" }} />
              <div className="rounded" style={{ width: "30%", height: "12px", backgroundColor: "#F1F5F9" }} />
            </div>
            <div className="rounded-full" style={{ width: "64px", height: "22px", backgroundColor: "#DBEAFE" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
