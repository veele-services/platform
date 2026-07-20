export type OfflineActionFailureCategory = "transient" | "permanent" | "conflict";

export type OfflineActionFailure = {
  category: OfflineActionFailureCategory;
  code: string;
  conflictVersion: number | null;
  diagnosticId: string;
  retryAfterMs: number | null;
  retryable: boolean;
  sqlState: string | null;
  status: number | null;
};

export type OfflineActionFailureResult = {
  error: string;
  failure: OfflineActionFailure;
  success: false;
};

export type OfflineActionSuccessResult<T extends object = object> = T & {
  error?: never;
  participantVersion: number;
  success: true;
};

export type OfflineActionResult<T extends object = object> =
  | OfflineActionFailureResult
  | OfflineActionSuccessResult<T>;
