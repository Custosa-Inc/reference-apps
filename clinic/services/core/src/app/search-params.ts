/** What Next.js passes a page as searchParams. A name repeated in the URL arrives as an array. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The first value of a search parameter, so ?q=smith&q=jones reads as "smith". */
export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
