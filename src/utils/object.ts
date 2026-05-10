/**
 * Object Utilities
 *
 * omitUndefined: Filters out undefined values from an object while preserving
 * TypeScript type narrowing. Used to replace the repetitive
 * ...(x !== undefined && { x }) pattern across the codebase.
 */
export const omitUndefined = <T extends Record<string, unknown>>(
  obj: T
): { [K in keyof T]: Exclude<T[K], undefined> } => {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
};