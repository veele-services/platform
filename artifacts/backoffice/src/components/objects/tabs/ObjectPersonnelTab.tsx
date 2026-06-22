"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { UserMinus, Users, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  linkObjectPersonnel,
  unlinkObjectPersonnel,
  type ObjectPersonnelRow,
  type PersonnelOption,
} from "@/app/actions/objects";

interface Props {
  objectId: string;
  personnel: ObjectPersonnelRow[];
  options: PersonnelOption[];
  canWrite: boolean;
}

export function ObjectPersonnelTab({ objectId, personnel: initialPersonnel, options, canWrite }: Props) {
  const [personnel, setPersonnel] = useState(initialPersonnel);
  const [comboOpen, setComboOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const linkedIds = new Set(personnel.map((p) => p.personnelId));
  const available = options.filter((o) => !linkedIds.has(o.id));

  function handleLink(option: PersonnelOption) {
    setComboOpen(false);
    startTransition(async () => {
      const result = await linkObjectPersonnel(objectId, option.id);
      if (result.success) {
        toast.success(`${option.firstName} ${option.lastName} gekoppeld`);
        setPersonnel((prev) => [
          ...prev,
          {
            personnelId: option.id,
            firstName: option.firstName,
            lastName: option.lastName,
            code: option.code,
            roleName: option.roleName,
            linkedAt: new Date().toISOString(),
            assignmentCount: 0,
            completedCount: 0,
            lastWorkedAt: null,
          },
        ]);
      } else {
        toast.error(result.message ?? "Koppelen mislukt");
      }
    });
  }

  function handleUnlink(row: ObjectPersonnelRow) {
    startTransition(async () => {
      const result = await unlinkObjectPersonnel(objectId, row.personnelId);
      if (result.success) {
        toast.success(`${row.firstName} ${row.lastName} ontkoppeld`);
        setPersonnel((prev) => prev.filter((p) => p.personnelId !== row.personnelId));
      } else {
        toast.error(result.message ?? "Ontkoppelen mislukt");
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <p className="text-sm font-medium" style={{ color: "#081D3A" }}>
            Vaste teams &amp; voorkeursmedewerkers
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
            {personnel.length} medewerker{personnel.length !== 1 ? "s" : ""} gekoppeld. Deze voorkeur wordt meegenomen in slim plannen.
          </p>
        </div>
        {canWrite && (
          <Popover open={comboOpen} onOpenChange={setComboOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" disabled={isPending || available.length === 0}>
                <ChevronsUpDown className="mr-1.5 h-4 w-4" />
                Medewerker koppelen
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="end">
              <Command>
                <CommandInput placeholder="Zoek medewerker..." />
                <CommandList>
                  <CommandEmpty>Geen medewerkers gevonden.</CommandEmpty>
                  <CommandGroup>
                    {available.map((o) => (
                      <CommandItem
                        key={o.id}
                        value={`${o.firstName} ${o.lastName} ${o.code}`}
                        onSelect={() => handleLink(o)}
                      >
                        <Check className={cn("mr-2 h-4 w-4", "opacity-0")} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm truncate">{o.firstName} {o.lastName}</span>
                          <span className="text-xs" style={{ color: "#94A3B8" }}>
                            {o.code}{o.roleName ? ` - ${o.roleName}` : ""}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {personnel.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-10 w-10 mb-3" style={{ color: "#CBD5E1" }} />
          <p className="text-sm font-medium" style={{ color: "#64748B" }}>Geen vast team gekoppeld</p>
          <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>
            {canWrite
              ? "Koppel medewerkers die vast of bij voorkeur op dit object werken."
              : "Geen medewerkers gekoppeld aan dit object."}
          </p>
        </div>
      ) : (
        <div className="veele-card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                {(["Medewerker", "Code", "Functie", "Ervaring", "Laatste inzet", "Gekoppeld op"] as const).map((header) => (
                  <th key={header} className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
                    {header}
                  </th>
                ))}
                {canWrite && <th className="w-12 px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {personnel.map((p, i) => (
                <tr
                  key={p.personnelId}
                  className="transition-colors hover:bg-slate-50/60"
                  style={{ borderBottom: i < personnel.length - 1 ? "1px solid #F1F5F9" : undefined }}
                >
                  <td className="px-5 py-3 text-sm font-medium" style={{ color: "#081D3A" }}>
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs rounded px-1.5 py-0.5 bg-slate-100" style={{ color: "#475569" }}>
                      {p.code}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                    {p.roleName ?? "-"}
                  </td>
                  <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                    <span className="font-medium" style={{ color: "#081D3A" }}>{p.assignmentCount}</span>
                    <span className="text-xs"> inzet{p.assignmentCount !== 1 ? "ten" : ""}</span>
                    {p.completedCount > 0 && (
                      <span className="block text-xs" style={{ color: "#0A7E7A" }}>
                        {p.completedCount} afgerond
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                    {p.lastWorkedAt ? new Date(p.lastWorkedAt).toLocaleDateString("nl-NL") : "Nog niet ingezet"}
                  </td>
                  <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                    {new Date(p.linkedAt).toLocaleDateString("nl-NL")}
                  </td>
                  {canWrite && (
                    <td className="pr-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleUnlink(p)}
                        disabled={isPending}
                        title="Ontkoppelen"
                      >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
