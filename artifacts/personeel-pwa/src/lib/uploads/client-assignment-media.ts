"use client";

import {
  validateAssignmentMediaDescriptor,
  type AssignmentMediaValidationOptions,
  type AssignmentMediaValidationResult,
} from "./assignment-media";

const IMAGE_COMPRESS_THRESHOLD_BYTES = 2 * 1024 * 1024;
const IMAGE_COMPRESS_MAX_DIMENSION = 1920;
const IMAGE_COMPRESS_QUALITY = 0.82;

export function validateAssignmentMediaFile(
  file: File,
  options?: AssignmentMediaValidationOptions,
): AssignmentMediaValidationResult {
  return validateAssignmentMediaDescriptor(
    {
      fileName: file.name,
      mimeType: file.type || null,
      fileSize: file.size,
    },
    options,
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Afbeelding kon niet worden gelezen"));
    image.src = url;
  });
}

export async function compressImageIfUseful(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  if (file.size < IMAGE_COMPRESS_THRESHOLD_BYTES) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = largestSide > IMAGE_COMPRESS_MAX_DIMENSION
      ? IMAGE_COMPRESS_MAX_DIMENSION / largestSide
      : 1;

    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, file.type, IMAGE_COMPRESS_QUALITY);
    });

    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
