/** The token in a scanned CampusPin link (`https://…/q/<token>`), or null for any other code. */
export function tokenFromScan(data: string): string | null {
  const text = data.trim();
  const match = /\/q\/([A-Za-z0-9_-]{16,32})(?:[/?#]|$)/.exec(text);
  if (match?.[1]) return match[1];
  return /^[A-Za-z0-9_-]{22}$/.test(text) ? text : null;
}
