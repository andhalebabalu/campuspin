'use client';

/** Opens a private file (fetched with the session) in a new tab, or saves it under `name`. */
export async function openPrivateFile(load: () => Promise<Blob>, name?: string): Promise<void> {
  const blob = await load();
  const url = URL.createObjectURL(blob);
  if (name) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
