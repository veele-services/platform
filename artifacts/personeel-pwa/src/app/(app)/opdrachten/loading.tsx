export default function OpdrachtenLoading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div
        className="px-4 pt-4 pb-3 md:px-0 md:pt-0"
      >
        <div className="rounded" style={{ width: "140px", height: "28px", backgroundColor: "#E2E8F0" }} />
      </div>

      {/* List items */}
      <div className="space-y-2 px-4 md:px-0">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-white p-4 shadow-sm flex items-center gap-3"
          >
            <div
              className="rounded-xl shrink-0"
              style={{ width: "44px", height: "44px", backgroundColor: "#E2E8F0" }}
            />
            <div className="flex-1 space-y-2">
              <div className="rounded" style={{ width: "55%", height: "16px", backgroundColor: "#E2E8F0" }} />
              <div className="rounded" style={{ width: "40%", height: "12px", backgroundColor: "#F1F5F9" }} />
            </div>
            <div className="rounded-full" style={{ width: "64px", height: "22px", backgroundColor: "#E2E8F0" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
