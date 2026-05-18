/**
 * String Utilities
 *
 * getStringBetween: Extracts substring between two delimiters
 * parseRoamDateString: Converts Roam date string to JS Date via Roam API
 * dateToRoamDateString: Converts JS Date to Roam date string via Roam API
 * parseConfigString: Splits "key:: value" into [key, value]
 * pluralize: Returns singular or plural form based on count
 * isNumeric: Checks if a string represents a valid number
 */
export const getStringBetween = (string, from, to) =>
  string.substring(string.indexOf(from) + from.length, string.lastIndexOf(to));

export const parseRoamDateString = (roamDateString: string): Date =>
  window.roamAlphaAPI.util.pageTitleToDate(roamDateString.trim());

export const dateToRoamDateString = (jsDateObject) =>
  window.roamAlphaAPI.util.dateToPageTitle(jsDateObject);

export const parseConfigString = (configString: string): [string, string] => {
  const parts = configString.split('::');
  const key = parts[0].trim();
  const value = parts.slice(1).join('::').trim();
  return [key, value];
};

export const pluralize = (value: number, singular: string, plural: string) => {
  if (value === 1) return singular;
  return plural;
};

export const isNumeric = (str) => {
  if (typeof str != 'string') return false;

  const numericValue = Number(str);
  return !Number.isNaN(numericValue) && !Number.isNaN(parseFloat(str));
};
