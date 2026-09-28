import type { ItemSection, ServiceItem } from '@platform/contracts';

/** Items grouped by section, sections in the order their first item appears. */
export function sectionsOfItems(items: readonly ServiceItem[]): ItemSection[] {
  const sections = new Map<string, ServiceItem[]>();
  for (const item of items) {
    const list = sections.get(item.section) ?? [];
    list.push(item);
    sections.set(item.section, list);
  }
  return [...sections].map(([name, list]) => ({ name, items: list }));
}
