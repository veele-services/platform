"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit, Loader2, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetSmartPlanningSectorRule,
  updateSmartPlanningSectorRule,
  type SmartPlanningSectorRuleRow,
} from "@/app/actions/smart-planning-settings";

type Props = {
  data: SmartPlanningSectorRuleRow[];
  canWrite: boolean;
};

type WeightKey = keyof SmartPlanningSectorRuleRow["weights"];

const WEIGHT_FIELDS: Array<{
  key: WeightKey;
  label: string;
  description: string;
}> = [
  {
    key: "availability",
    label: "Beschikbaarheid",
    description: "Hoe zwaar volledige beschikbaarheid binnen het gewenste tijdvak meetelt.",
  },
  {
    key: "role",
    label: "Functie",
    description: "Of de medewerker de vereiste rol of functie voor deze taak heeft.",
  },
  {
    key: "qualifications",
    label: "Certificaten, diploma's en kennis",
    description: "Verplichte kwalificaties uit functies en taakcodes, zoals Beveiliger 2 of VCA.",
  },
  {
    key: "region",
    label: "Afstand en regio",
    description: "Match met objectregio, voorkeursregio en praktische reistijd.",
  },
  {
    key: "objectExperience",
    label: "Object- en klantervaring",
    description: "Eerdere opdrachten bij dezelfde klant of op hetzelfde object.",
  },
  {
    key: "workload",
    label: "Urenbelasting",
    description: "Voorkomt overbelasting en helpt uren eerlijker over het team te verdelen.",
  },
  {
    key: "emergency",
    label: "Spoedbeschikbaarheid",
    description: "Extra waarde voor medewerkers die expliciet spoedbeschikbaar zijn.",
  },
  {
    key: "fixedTeams",
    label: "Vaste teams",
    description: "Geeft vaste of voorkeursmedewerkers voor een object meer gewicht.",
  },
  {
    key: "preferences",
    label: "Voorkeuren medewerker",
    description: "Neemt voorkeuren zoals regio of bekende werkcontext mee in de eindscore.",
  },
];

function clampWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function totalWeight(rule: SmartPlanningSectorRuleRow): number {
  return Object.values(rule.weights).reduce((sum, weight) => sum + weight, 0);
}

function totalTone(total: number) {
  if (total === 100) {
    return {
      label: "Totaal 100%",
      color: "#047857",
      bg: "#ECFDF5",
      note: "De score wordt exact volgens deze verhouding gebruikt.",
    };
  }
  return {
    label: `Totaal ${total}%`,
    color: "#B45309",
    bg: "#FFFBEB",
    note: "De matching-engine normaliseert dit automatisch naar 100%.",
  };
}

export function SmartPlanningRulesView({ data, canWrite }: Props) {
  const router = useRouter();
  const [rules, setRules] = useState(data);
  const [pendingSectorId, setPendingSectorId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.sectorName.localeCompare(b.sectorName, "nl")),
    [rules],
  );

  function updateRule(
    sectorId: string,
    updater: (rule: SmartPlanningSectorRuleRow) => SmartPlanningSectorRuleRow,
  ) {
    setRules((current) =>
      current.map((rule) => (rule.sectorId === sectorId ? updater(rule) : rule)),
    );
  }

  function updateWeight(sectorId: string, key: WeightKey, value: number) {
    updateRule(sectorId, (rule) => ({
      ...rule,
      weights: {
        ...rule.weights,
        [key]: clampWeight(value),
      },
    }));
  }

  function saveRule(rule: SmartPlanningSectorRuleRow) {
    setPendingSectorId(rule.sectorId);
    startTransition(async () => {
      const result = await updateSmartPlanningSectorRule({
        sectorId: rule.sectorId,
        weights: rule.weights,
        topMatchThreshold: rule.topMatchThreshold,
        defaultRoundSize: rule.defaultRoundSize,
        roundIntervalMinutes: rule.roundIntervalMinutes,
        maxDailyInvites: rule.maxDailyInvites,
        reminderAfterMinutes: rule.reminderAfterMinutes,
        inviteCooldownMinutes: rule.inviteCooldownMinutes,
        allowEmergencyOverride: rule.allowEmergencyOverride,
        isActive: rule.isActive,
      });
      setPendingSectorId(null);
      if (result.success) {
        toast.success(`Slimme planning voor ${rule.sectorName} opgeslagen`);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function resetRule(rule: SmartPlanningSectorRuleRow) {
    setPendingSectorId(rule.sectorId);
    startTransition(async () => {
      const result = await resetSmartPlanningSectorRule(rule.sectorId);
      setPendingSectorId(null);
      if (result.success) {
        toast.success(`Standaardwegingen voor ${rule.sectorName} hersteld`);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="veele-card">
        <div className="flex items-start gap-4">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: "#E0FAFB", color: "#075E5D" }}
          >
            <BrainCircuit className="h-5 w-5" />
          </span>
          <div className="max-w-4xl">
            <h2 className="font-heading text-lg font-semibold" style={{ color: "#081D3A" }}>
              Sectorregels voor slimme planning
            </h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "#64748B" }}>
              Deze instellingen bepalen hoe kandidaten binnen een sector worden gerangschikt nadat harde filters al zijn toegepast.
              Harde filters zoals actief, geen verlof/ziekte, geen overlap, juiste sector, functie en verplichte kwalificaties blijven altijd blokkerend.
            </p>
          </div>
        </div>
      </section>

      <div className="space-y-5">
        {sortedRules.map((rule) => {
          const total = totalWeight(rule);
          const tone = totalTone(total);
          const pending = isPending && pendingSectorId === rule.sectorId;

          return (
            <section key={rule.sectorId} className="veele-card overflow-hidden p-0">
              <div
                className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between"
                style={{ borderBottom: "1px solid #E2E8F0" }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "#F0FDFA", color: "#0F766E" }}
                  >
                    <SlidersHorizontal className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
                        {rule.sectorName}
                      </h3>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor: rule.isActive ? "#ECFDF5" : "#F8FAFC",
                          color: rule.isActive ? "#047857" : "#64748B",
                        }}
                      >
                        {rule.isActive ? "Actief" : "Uitgeschakeld"}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: tone.bg, color: tone.color }}
                      >
                        {tone.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
                      {tone.note}
                    </p>
                    {rule.updatedAt && (
                      <p className="mt-1 text-xs" style={{ color: "#94A3B8" }}>
                        Laatst bijgewerkt: {new Date(rule.updatedAt).toLocaleString("nl-NL")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <label
                    className="inline-flex h-9 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium"
                    style={{ color: "#475569" }}
                  >
                    <input
                      type="checkbox"
                      checked={rule.isActive}
                      disabled={!canWrite || pending}
                      onChange={(event) =>
                        updateRule(rule.sectorId, (current) => ({
                          ...current,
                          isActive: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Regel actief
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canWrite || pending}
                    onClick={() => resetRule(rule)}
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Reset
                  </Button>
                  <Button type="button" disabled={!canWrite || pending} onClick={() => saveRule(rule)}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Opslaan
                  </Button>
                </div>
              </div>

              <div className="grid gap-6 p-5 xl:grid-cols-[1fr_320px]">
                <div className="grid gap-4 lg:grid-cols-2">
                  {WEIGHT_FIELDS.map((field) => (
                    <div key={field.key} className="rounded-lg border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Label className="text-sm font-semibold" style={{ color: "#081D3A" }}>
                            {field.label}
                          </Label>
                          <p className="mt-1 text-xs leading-relaxed" style={{ color: "#64748B" }}>
                            {field.description}
                          </p>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={rule.weights[field.key]}
                          disabled={!canWrite || pending}
                          onChange={(event) =>
                            updateWeight(rule.sectorId, field.key, Number(event.target.value))
                          }
                          className="h-9 w-20 text-right"
                        />
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={rule.weights[field.key]}
                        disabled={!canWrite || pending}
                        onChange={(event) =>
                          updateWeight(rule.sectorId, field.key, Number(event.target.value))
                        }
                        className="mt-4 w-full accent-[#00B7B3]"
                        aria-label={field.label}
                      />
                    </div>
                  ))}
                </div>

                <aside className="space-y-4">
                  <div className="rounded-lg border bg-slate-50 p-4">
                    <h4 className="text-sm font-semibold" style={{ color: "#081D3A" }}>
                      Rondes & drempels
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "#64748B" }}>
                      Deze waarden worden gebruikt voor topmatches en interessepeilingen. De uitgebreide rondegeschiedenis hoort bij TAAK-10.
                    </p>
                    <div className="mt-4 space-y-3">
                      <NumberField
                        label="Topmatch vanaf"
                        suffix="%"
                        min={1}
                        max={100}
                        value={rule.topMatchThreshold}
                        disabled={!canWrite || pending}
                        onChange={(value) =>
                          updateRule(rule.sectorId, (current) => ({
                            ...current,
                            topMatchThreshold: value,
                          }))
                        }
                      />
                      <NumberField
                        label="Rondegrootte"
                        suffix="kandidaten"
                        min={1}
                        max={50}
                        value={rule.defaultRoundSize}
                        disabled={!canWrite || pending}
                        onChange={(value) =>
                          updateRule(rule.sectorId, (current) => ({
                            ...current,
                            defaultRoundSize: value,
                          }))
                        }
                      />
                      <NumberField
                        label="Ronde verloopt na"
                        suffix="min."
                        min={1}
                        max={1440}
                        value={rule.roundIntervalMinutes}
                        disabled={!canWrite || pending}
                        onChange={(value) =>
                          updateRule(rule.sectorId, (current) => ({
                            ...current,
                            roundIntervalMinutes: value,
                          }))
                        }
                      />
                      <NumberField
                        label="Max. uitnodigingen per dag"
                        suffix="per medewerker"
                        min={1}
                        max={100}
                        value={rule.maxDailyInvites}
                        disabled={!canWrite || pending}
                        onChange={(value) =>
                          updateRule(rule.sectorId, (current) => ({
                            ...current,
                            maxDailyInvites: value,
                          }))
                        }
                      />
                      <NumberField
                        label="Reminder na"
                        suffix="min. geen reactie"
                        min={1}
                        max={1440}
                        value={rule.reminderAfterMinutes}
                        disabled={!canWrite || pending}
                        onChange={(value) =>
                          updateRule(rule.sectorId, (current) => ({
                            ...current,
                            reminderAfterMinutes: value,
                          }))
                        }
                      />
                      <NumberField
                        label="Invite-cooldown"
                        suffix="min. tussen rondes"
                        min={0}
                        max={10080}
                        value={rule.inviteCooldownMinutes}
                        disabled={!canWrite || pending}
                        onChange={(value) =>
                          updateRule(rule.sectorId, (current) => ({
                            ...current,
                            inviteCooldownMinutes: value,
                          }))
                        }
                      />
                      <label
                        className="flex items-start gap-3 rounded-lg border bg-white p-3 text-sm"
                        style={{ color: "#475569" }}
                      >
                        <input
                          type="checkbox"
                          checked={rule.allowEmergencyOverride}
                          disabled={!canWrite || pending}
                          onChange={(event) =>
                            updateRule(rule.sectorId, (current) => ({
                              ...current,
                              allowEmergencyOverride: event.target.checked,
                            }))
                          }
                          className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        />
                        <span>
                          <span className="block font-semibold" style={{ color: "#081D3A" }}>
                            Spoed mag anti-spam overschrijven
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: "#64748B" }}>
                            Bij spoedrondes mag planning daglimiet en cooldown overslaan. Overlap met bestaande planning blijft altijd geblokkeerd.
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-white p-4">
                    <h4 className="text-sm font-semibold" style={{ color: "#081D3A" }}>
                      Wat gebeurt er met deze score?
                    </h4>
                    <ul className="mt-3 space-y-2 text-xs leading-relaxed" style={{ color: "#64748B" }}>
                      <li>1. Eerst vallen medewerkers af op harde blokkades.</li>
                      <li>2. Daarna krijgt elke geschikte medewerker een uitlegbare score.</li>
                      <li>3. Planning ziet topmatches bovenaan bij capaciteit en planbord.</li>
                      <li>4. Bij wijzigen worden nieuwe capaciteitschecks met deze weging berekend.</li>
                    </ul>
                  </div>
                </aside>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function NumberField({
  label,
  suffix,
  min,
  max,
  value,
  disabled,
  onChange,
}: {
  label: string;
  suffix: string;
  min: number;
  max: number;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium" style={{ color: "#475569" }}>
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(clampNumber(Number(event.target.value), min, max))}
          className="h-9 flex-1"
        />
        <span className="w-24 text-xs" style={{ color: "#94A3B8" }}>
          {suffix}
        </span>
      </div>
    </div>
  );
}
