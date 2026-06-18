export default function FacturenLoading() {
  return (
    <div className="animate-pulse">
      <div className="px-4 pt-4 pb-3 md:px-0 md:pt-0">
        <div className="rounded" style={{ width: "100px", height: "28px", backgroundColor: "#E2E8F0" }} />
      </div>

      {/* Summary card */}
      <div className="px-4 md:px-0 mb-4">
        <div
          className="rounded-2xl"
          style={{ backgroundColor: "#DBEAFE", height: "80px" }}
        />
      </div>

      {/* Invoice list */}
      <div className="space-y-3 px-4 md:px-0">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="rounded" style={{ width: "40%", height: "16px", backgroundColor: "#E2E8F0" }} />
              <div className="rounded-full" style={{ width: "60px", height: "22px", backgroundColor: "#DBEAFE" }} />
            </div>
            <div className="flex items-center justify-between">
              <div className="rounded" style={{ width: "30%", height: "12px", backgroundColor: "#F1F5F9" }} />
              <div className="rounded" style={{ width: "24%", height: "20px", backgroundColor: "#E2E8F0" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
