export type TimelineProjection = {
  projectedEndAfterStart: Date;
  startShiftMinutes: number;
  completionShiftMinutes: number;
  totalShiftMinutes: number;
};

export function projectTimeline(input: { plannedStart: Date; plannedEnd: Date; actualStart: Date; actualEnd: Date }): TimelineProjection {
  const durationMs = input.plannedEnd.getTime() - input.plannedStart.getTime();
  if (durationMs <= 0 || input.actualEnd < input.actualStart) throw new Error("Ongeldige planning");
  const projectedEndAfterStart = new Date(input.actualStart.getTime() + durationMs);
  const startShiftMinutes = (projectedEndAfterStart.getTime() - input.plannedEnd.getTime()) / 60_000;
  const completionShiftMinutes = (input.actualEnd.getTime() - projectedEndAfterStart.getTime()) / 60_000;
  return { projectedEndAfterStart, startShiftMinutes, completionShiftMinutes, totalShiftMinutes: startShiftMinutes + completionShiftMinutes };
}
