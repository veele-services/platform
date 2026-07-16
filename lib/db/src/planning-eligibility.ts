import { calculateAssignmentCapacity, type SmartPlanningCapacityResult } from "./planning-intelligence";

export type CanonicalPlanningEligibilityResult = SmartPlanningCapacityResult;

/**
 * Canonical personnel planning eligibility entrypoint.
 *
 * Later flows such as interest selection should call this service instead of
 * duplicating availability, leave/sickness, active-personnel, conflict, region
 * or qualification predicates in UI-specific actions.
 */
export async function getCanonicalPlanningEligibility(
  assignmentId: string,
): Promise<CanonicalPlanningEligibilityResult | null> {
  return calculateAssignmentCapacity(assignmentId, { persist: false });
}
