export function normalizeTail(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value) : 300;
  if (!Number.isFinite(parsed)) {
    return 300;
  }

  return Math.min(2000, Math.max(50, Math.trunc(parsed)));
}
