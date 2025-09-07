// utils.ts

/**
 * Formats a number as a currency string.
 * @param value The number to format.
 * @param currency The currency code (e.g., 'USD').
 * @param locale The locale to use for formatting (e.g., 'en-US').
 * @returns A formatted currency string, or a default for invalid input.
 */
export const formatPrice = (
  value: number | null | undefined,
  currency: string = 'USD',
  locale: string = 'en-US'
): string => {
  if (value === null || typeof value === 'undefined' || isNaN(value)) {
    // Return a sensible default for missing or invalid data
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(0);
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).format(value);
};

/**
 * Formats a number with thousands separators.
 * @param value The number to format.
 * @param locale The locale to use for formatting (e.g., 'en-US').
 * @returns A formatted number string, or '0' if the value is invalid.
 */
export const formatNumber = (
  value: number | null | undefined,
  locale: string = 'en-US'
): string => {
  if (value === null || typeof value === 'undefined' || isNaN(value)) {
    return '0';
  }
  return new Intl.NumberFormat(locale).format(value);
};

/**
 * Formats a number as a percentage string.
 * @param value The number to format (e.g., 0.25 for 25%).
 * @returns A formatted percentage string.
 */
export const formatPercent = (value: number | null | undefined): string => {
    if (value === null || typeof value === 'undefined' || isNaN(value)) {
        return '0.00%';
    }
    return `${(value * 100).toFixed(2)}%`;
};

/**
 * Safely retrieves a nested property from an object using a dot-separated path.
 * @param obj The object to query.
 * @param path The path to the property (e.g., 'traffic_data.sessions').
 * @returns The value of the property, or undefined if not found.
 */
export const getNested = (obj: any, path: string): any => {
    return path.split('.').reduce((p, c) => (p && typeof p === 'object' && c in p) ? p[c] : undefined, obj);
};
