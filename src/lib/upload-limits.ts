/**
 * Shared limits for every file the app accepts into Vercel Blob.
 *
 * A plain module rather than constants inside an actions file: a 'use server'
 * module may only export async functions, so anything two upload paths need to
 * agree on has to live outside one. Compliance certificates and the crew document
 * library are held to the same limits, and that is not a coincidence to be
 * re-typed in two places.
 */

/**
 * 4 MB, not more: uploads travel through a server action, and Vercel refuses any
 * function request body over 4.5 MB. A bigger number here would only move the
 * failure from a clear message to an opaque 413. Larger files would need direct
 * browser-to-Blob uploads.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  // iPhones save photos as HEIC by default — a photo of a medical card must work.
  'image/heic',
  'image/heif',
  'image/webp',
  'text/plain',
]);

/** Null when the file is acceptable, otherwise the sentence to show the user. */
export function validateUpload(file: File): string | null {
  if (file.size === 0) return 'That file is empty';
  if (file.size > MAX_UPLOAD_BYTES) return 'That file is larger than 4 MB — try a PDF scan or a smaller photo';
  // Some browsers send an empty type for uncommon extensions; the size and the
  // private-by-default storage are the real controls, so an unknown type passes.
  if (file.type && !ALLOWED_UPLOAD_TYPES.has(file.type)) {
    return `${file.type} isn't an allowed file type`;
  }
  return null;
}
