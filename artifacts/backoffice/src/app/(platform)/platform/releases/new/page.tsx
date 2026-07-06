import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listReleaseEditorOptions } from "@/app/actions/releases";
import { ReleaseForm } from "@/components/releases/ReleaseForm";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Nieuwe release",
};

export default async function NewPlatformReleasePage() {
  const options = await listReleaseEditorOptions();

  return (
    <main className="px-5 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1500px] gap-6">
        <header className="border-b border-slate-200 pb-6">
          <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
            <Link href="/platform/releases">
              <ArrowLeft className="h-4 w-4" />
              Terug naar releases
            </Link>
          </Button>
          <p className="text-sm font-medium text-slate-500">Releasebeheer</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">Nieuwe release</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Maak een globale release note met audience- en modulegerichte zichtbaarheid.
          </p>
        </header>

        <ReleaseForm release={null} options={options} />
      </div>
    </main>
  );
}
