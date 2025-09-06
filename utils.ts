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
