import { redirect } from "next/navigation";
import { NativeDebugPanel } from "./NativeDebugPanel";

export const dynamic = "force-dynamic";

export default function NativeDebugPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_NATIVE_DEBUG !== "true") {
    redirect("/instellingen/meldingen");
  }

  return (
    <div className="min-h-[calc(100vh-4.2rem)] bg-[#F4F7FB] md:bg-transparent">
      <section className="bg-[#061F44] px-4 pb-10 pt-4 md:rounded-3xl md:bg-transparent md:px-6 md:pb-6">
        <h1 className="text-[29px] font-semibold leading-tight text-white md:text-3xl">
          Native diagnose
        </h1>
        <p className="mt-1 text-base font-medium text-white/68">
          Capacitor, Firebase en pushstatus
        </p>
      </section>

      <section className="-mt-7 min-h-[calc(100vh-14rem)] rounded-t-[28px] bg-[#F4F7FB] px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:mt-0 md:min-h-0 md:rounded-3xl md:px-0 md:pb-0 md:pt-0">
        <div className="mx-auto max-w-xl md:max-w-3xl">
          <NativeDebugPanel />
        </div>
      </section>
    </div>
  );
}
