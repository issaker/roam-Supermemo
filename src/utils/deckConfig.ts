import { DeckConfig } from '~/hooks/useSettings';

export const parseDeckConfigs = (
  str: string | undefined | null,
  fallback: DeckConfig[] = []
): DeckConfig[] => {
  if (!str) return fallback;
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export const parseDeckConfigNames = (
  str: string | undefined | null,
  fallback: string[] = ['memo']
): string[] => {
  const configs = parseDeckConfigs(str);
  if (!configs.length) return fallback;
  return configs.map((c) => c.name);
};
