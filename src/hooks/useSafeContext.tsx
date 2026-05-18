/**
 * useSafeContext Hook
 *
 * Type-safe context consumer that throws if the context provider is missing.
 * Prevents silent undefined errors when components are rendered outside
 * their expected provider tree.
 */
import { useContext, type Context } from 'react';

export function useSafeContext<T>(Context: Context<T>) {
  const context = useContext(Context);
  if (context === undefined) throw new Error('Context Provider not found');
  return context as T;
}
