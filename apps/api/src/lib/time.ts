export const nowIso = (): string => new Date().toISOString();
export const toIso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
