export const ASSIGNMENT_MEDIA_BUCKET = "assignment-photos";
export const ASSIGNMENT_MEDIA_TENANT_ROOT = "tenant";
export const ASSIGNMENT_MEDIA_ASSIGNMENT_ROOT = "assignments";

export const MAX_REPORT_NOTE_ATTACHMENTS = 5;
export const MAX_EXTRA_WORK_PHOTOS = 5;

export const MAX_ASSIGNMENT_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_ASSIGNMENT_VIDEO_BYTES = 25 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:\/\//iu;

export type AssignmentMediaKind = "image" | "video";

export type AssignmentMediaDescriptor = {
  fileName: string;
  mimeType: string | null | undefined;
  fileSize: number | null | undefined;
};

export type AssignmentMediaValidationOptions = {
  allowImages?: boolean;
  allowVideos?: boolean;
};

export type AssignmentMediaValidationResult =
  | { valid: true; kind: AssignmentMediaKind; fileName: string; mimeType: string; fileSize: number }
  | { valid: false; error: string };

export function getAssignmentMediaKind(mimeType: string | null | undefined): AssignmentMediaKind | null {
  const normalized = mimeType?.trim().toLowerCase();
  if (!normalized) return null;
  if (ALLOWED_IMAGE_TYPES.has(normalized)) return "image";
  if (ALLOWED_VIDEO_TYPES.has(normalized)) return "video";
  return null;
}

export function formatUploadLimit(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export function safeStorageFileName(fileName: string): string {
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  const fallback = extension ? `bijlage.${extension}` : "bijlage";
  const cleaned = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);

  return cleaned || fallback;
}

function safeStorageSegment(value: string, fallback = "item"): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return cleaned || fallback;
}

function isValidStorageId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function hasUnsafeStoragePath(path: string): boolean {
  return (
    path.includes("..") ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.split("/").some((part) => part.trim() === "")
  );
}

function normalizeAssignmentMediaStoragePath(path: string): string | null {
  const normalized = path.trim().replace(/^\/+/, "");
  if (!normalized) return null;
  if (URL_SCHEME_PATTERN.test(normalized)) return null;
  if (hasUnsafeStoragePath(normalized)) return null;
  return normalized;
}

function getAssignmentMediaSuffix(
  tenantId: string,
  assignmentId: string,
  storagePath: string,
): string | null {
  if (!isValidStorageId(tenantId) || !isValidStorageId(assignmentId)) return null;

  const normalized = normalizeAssignmentMediaStoragePath(storagePath);
  if (!normalized) return null;

  const allowedPrefixes = [
    `${ASSIGNMENT_MEDIA_TENANT_ROOT}/${tenantId}/${ASSIGNMENT_MEDIA_ASSIGNMENT_ROOT}/${assignmentId}/`,
    `${tenantId}/${ASSIGNMENT_MEDIA_ASSIGNMENT_ROOT}/${assignmentId}/`,
    `tenants/${tenantId}/${ASSIGNMENT_MEDIA_ASSIGNMENT_ROOT}/${assignmentId}/`,
    `${ASSIGNMENT_MEDIA_ASSIGNMENT_ROOT}/${assignmentId}/`,
    `${assignmentId}/`,
  ];

  for (const prefix of allowedPrefixes) {
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length);
    }
  }

  return null;
}

export function isReportNoteAttachmentPath(tenantId: string, assignmentId: string, storagePath: string): boolean {
  return getAssignmentMediaSuffix(tenantId, assignmentId, storagePath)?.startsWith("report-notes/") ?? false;
}

export function isExtraWorkPhotoPath(
  tenantId: string,
  assignmentId: string,
  extraWorkId: string,
  storagePath: string,
): boolean {
  if (!isValidStorageId(extraWorkId)) return false;
  const suffix = getAssignmentMediaSuffix(tenantId, assignmentId, storagePath);
  return suffix?.startsWith(`extra-work/${extraWorkId}/`) ?? false;
}

export function buildReportNoteAttachmentPath(
  tenantId: string,
  assignmentId: string,
  fileName: string,
  uniqueId: string,
): string {
  if (!isValidStorageId(tenantId) || !isValidStorageId(assignmentId)) {
    throw new Error("Ongeldige opdracht voor uploadpad");
  }

  return [
    ASSIGNMENT_MEDIA_TENANT_ROOT,
    tenantId,
    ASSIGNMENT_MEDIA_ASSIGNMENT_ROOT,
    assignmentId,
    "report-notes",
    `${Date.now()}-${safeStorageSegment(uniqueId, "upload")}-${safeStorageFileName(fileName)}`,
  ].join("/");
}

export function buildExtraWorkPhotoPath(
  tenantId: string,
  assignmentId: string,
  extraWorkId: string,
  fileName: string,
  uniqueId: string,
): string {
  if (!isValidStorageId(tenantId) || !isValidStorageId(assignmentId) || !isValidStorageId(extraWorkId)) {
    throw new Error("Ongeldige opdracht voor uploadpad");
  }

  return [
    ASSIGNMENT_MEDIA_TENANT_ROOT,
    tenantId,
    ASSIGNMENT_MEDIA_ASSIGNMENT_ROOT,
    assignmentId,
    "extra-work",
    extraWorkId,
    `${Date.now()}-${safeStorageSegment(uniqueId, "upload")}-${safeStorageFileName(fileName)}`,
  ].join("/");
}

export function validateAssignmentMediaDescriptor(
  descriptor: AssignmentMediaDescriptor,
  options: AssignmentMediaValidationOptions = {},
): AssignmentMediaValidationResult {
  const allowImages = options.allowImages ?? true;
  const allowVideos = options.allowVideos ?? true;
  const fileName = descriptor.fileName.trim();
  const mimeType = descriptor.mimeType?.trim().toLowerCase() ?? "";
  const fileSize = Number.isFinite(descriptor.fileSize ?? NaN)
    ? Math.max(0, Math.round(descriptor.fileSize!))
    : 0;

  if (!fileName) {
    return { valid: false, error: "Bestandsnaam ontbreekt" };
  }

  const kind = getAssignmentMediaKind(mimeType);
  if (!kind) {
    return {
      valid: false,
      error: "Alleen JPG, PNG, WebP, MP4, WebM en MOV bestanden zijn toegestaan",
    };
  }

  if (kind === "image" && !allowImages) {
    return { valid: false, error: "Afbeeldingen zijn hier niet toegestaan" };
  }

  if (kind === "video" && !allowVideos) {
    return { valid: false, error: "Video's zijn hier niet toegestaan" };
  }

  if (fileSize <= 0) {
    return { valid: false, error: "Bestand is leeg of ongeldig" };
  }

  const maxSize = kind === "image" ? MAX_ASSIGNMENT_IMAGE_BYTES : MAX_ASSIGNMENT_VIDEO_BYTES;
  if (fileSize > maxSize) {
    return {
      valid: false,
      error: `${kind === "image" ? "Foto" : "Video"} is te groot. Maximaal ${formatUploadLimit(maxSize)} toegestaan.`,
    };
  }

  return { valid: true, kind, fileName, mimeType, fileSize };
}
