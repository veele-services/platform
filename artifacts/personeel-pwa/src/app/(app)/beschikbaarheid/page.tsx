export const dynamic = "force-dynamic";

import { getMyAvailabilityCalendar } from "@/actions/availability";
import { BeschikbaarheidForm } from "./BeschikbaarheidForm";

export default async function BeschikbaarheidPage() {
  const data = await getMyAvailabilityCalendar();

  return (
    <div className="min-h-[calc(100vh-4.2rem)] bg-[#061F44] md:bg-transparent">
      <section className="px-4 pb-6 pt-4 md:rounded-3xl md:px-6">
        <h1 className="text-[29px] font-black leading-tight text-white md:text-3xl">
          Beschikbaarheid
        </h1>
        <p className="mt-1 text-base font-medium text-white/68">
          Beheer je beschikbaarheid en voorkeuren
        </p>
      </section>

      <section className="rounded-t-[28px] bg-[#F4F7FB] px-3.5 pb-6 pt-4 md:rounded-3xl md:px-0 md:pt-0">
        <BeschikbaarheidForm data={data} />
      </section>
    </div>
  );
}
