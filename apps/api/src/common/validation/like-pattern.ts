/**
 * Escapes LIKE wildcards so user input is matched literally ("50%" finds "50%",
 * not everything). The value is still sent as a bound parameter.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
