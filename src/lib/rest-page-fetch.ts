/** PostgREST 預設常只回傳前 1000 列；一次讀全表必須分頁，失敗不得假裝讀完。 */

export const REST_PAGE_SIZE = 1000;
export const REST_MAX_PAGES = 50;

export type RestPageResult<T> = { data: T[] | null; error: unknown };

export type RestAllPagesOk<T> = { ok: true; rows: T[] };
export type RestAllPagesFail<T> = { ok: false; error: unknown; partialRows: T[] };
export type RestAllPages<T> = RestAllPagesOk<T> | RestAllPagesFail<T>;

export function restIncompleteReadError(): Error {
  return new Error("read_incomplete");
}

export async function fetchAllRestPages<T>(
  fetchPage: (from: number, to: number) => Promise<RestPageResult<T>>,
  pageSize: number = REST_PAGE_SIZE,
): Promise<RestAllPages<T>> {
  const size = Math.max(1, pageSize);
  const rows: T[] = [];
  for (let page = 0; page < REST_MAX_PAGES; page += 1) {
    const from = page * size;
    const to = from + size - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) return { ok: false, error, partialRows: rows };
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < size) return { ok: true, rows };
  }
  return { ok: false, error: restIncompleteReadError(), partialRows: rows };
}
