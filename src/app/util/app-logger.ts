/**
 * App-level logger for asset/config/data load failures.
 * Can be swapped or disabled later (e.g. in production).
 */
export const logger = {
  warn(message: string, ...args: unknown[]): void {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[App] ${message}`, ...args);
    }
  },
};
