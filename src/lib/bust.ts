/**
 * Cache-busting URL helper.
 *
 * Lives on its own so data modules can use it without importing the whole
 * traffic hook: `useTrafficData` needs the civil-time helpers, and importing
 * them from a module that imported `bust` back would make a cycle.
 */
export function bust(url: string): string {
  return `${url}?t=${Date.now()}`;
}
