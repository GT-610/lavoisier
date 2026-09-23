/**
 * Class-name helper.
 *
 * Lives in its own module rather than in `ui.tsx` so that file only exports
 * components, which is what React Fast Refresh needs to hot-swap them.
 */
export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}
