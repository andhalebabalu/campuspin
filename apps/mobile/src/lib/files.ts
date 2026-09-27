/**
 * A picked or captured image, as React Native's `FormData` sends files: by local URI, not as a
 * browser `File`.
 */
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
}

/** Appends a local file to a multipart form (React Native's FormData accepts `{ uri, name, type }`). */
export function appendFile(form: FormData, field: string, file: LocalFile): void {
  form.append(field, file as unknown as Blob);
}
