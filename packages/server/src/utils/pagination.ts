export function getPagination(query: Record<string, unknown>) {
  const page = Number(query.page ?? 1);
  const pageSize = Math.min(Number(query.pageSize ?? 10), 100);
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}
