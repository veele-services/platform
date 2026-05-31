export const LEAVE_TYPES = ["vakantie", "ziekte", "overig"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
