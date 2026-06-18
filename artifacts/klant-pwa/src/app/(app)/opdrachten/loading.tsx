export default function OpdrachtenLoading() {
  return (
    <div className="animate-pulse">
      <div className="px-4 pt-4 pb-3 md:px-0 md:pt-0">
        <div className="rounded" style={{ width: "120px", height: "28px", backgroundColor: "#E2E8F0" }} />
      </div>

      <div className="space-y-3 px-4 md:px-0">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-white p-4 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="rounded" style={{ width: "45%", height: "16px", backgroundColor: "#E2E8F0" }} />
              <div className="rounded-full" style={{ width: "72px", height: "22px", backgroundColor: "#DBEAFE" }} />
            </div>
            <div className="rounded" style={{ width: "35%", height: "12px", backgroundColor: "#F1F5F9" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
