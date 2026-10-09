import type { ListQueryDto } from "../dto/list-query.dto.js";

const DEFAULT_LIMIT = 25;

export function pageArgs(query: ListQueryDto): { skip?: number; take?: number } {
  if (!query.page && !query.limit) return {};
  const limit = query.limit ?? DEFAULT_LIMIT;
  return { skip: ((query.page ?? 1) - 1) * limit, take: limit };
}

/** Wraps a list in the standard envelope, adding `meta` only when the caller asked for a page. */
export async function paginated<T>(query: ListQueryDto, rows: Promise<T[]>, total: () => Promise<number>) {
  if (!query.page && !query.limit) return { success: true, data: await rows };
  const limit = query.limit ?? DEFAULT_LIMIT;
  const page = query.page ?? 1;
  const [data, count] = await Promise.all([rows, total()]);
  return { success: true, data, meta: { page, limit, total: count, pages: Math.ceil(count / limit) } };
}

/** Case-insensitive `contains` filter, or undefined when there is no search text. */
export function contains(search?: string) {
  return search?.trim() ? { contains: search.trim(), mode: "insensitive" as const } : undefined;
}
