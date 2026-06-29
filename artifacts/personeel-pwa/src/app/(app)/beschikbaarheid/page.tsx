export const dynamic = "force-dynamic";

import { getMyAvailabilityCalendar } from "@/actions/availability";
import { BeschikbaarheidForm } from "./BeschikbaarheidForm";

export default async function BeschikbaarheidPage() {
  const data = await getMyAvailabilityCalendar();

  return (
    <div className="min-h-[calc(100vh-4.2rem)] bg-[#F4F7FB] md:bg-transparent">
      <section className="bg-[#061F44] px-4 pb-10 pt-4 md:rounded-3xl md:bg-transparent md:px-6 md:pb-6">
        <h1 className="text-[29px] font-black leading-tight text-white md:text-3xl">
          Beschikbaarheid
        </h1>
        <p className="mt-1 text-base font-medium text-white/68">
          Beheer je beschikbaarheid en voorkeuren
        </p>
      </section>

      <section className="-mt-7 min-h-[calc(100vh-14rem)] rounded-t-[28px] bg-[#F4F7FB] px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:mt-0 md:min-h-0 md:rounded-3xl md:px-0 md:pb-0 md:pt-0">
        <BeschikbaarheidForm data={data} />
      </section>
    </div>
  );
}
