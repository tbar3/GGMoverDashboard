/**
 * Shared limits for every file the app accepts into Vercel Blob.
 *
 * A plain module rather than constants inside an actions file: a 'use server'
 * module may only export async functions, so anything two upload paths need to
 * agree on has to live outside one. Compliance certificates and the crew document
 * library are held to the same limits, and that is not a coincidence to be
 * re-typed in two places.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'text/plain',
]);

/** Null when the file is acceptable, otherwise the sentence to show the user. */
export function validateUpload(file: File): string | null {
  if (file.size === 0) return 'That file is empty';
  if (file.size > MAX_UPLOAD_BYTES) return 'That file is larger than 25 MB';
  // Some browsers send an empty type for uncommon extensions; the size and the
  // private-by-default storage are the real controls, so an unknown type passes.
  if (file.type && !ALLOWED_UPLOAD_TYPES.has(file.type)) {
    return `${file.type} isn't an allowed file type`;
  }
  return null;
}
