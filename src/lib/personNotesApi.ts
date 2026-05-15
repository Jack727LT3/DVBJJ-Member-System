/** Demo person ids used across member, trial, and guest flows. */
export function isDemoPersonId(id: string) {
  return (
    id.startsWith("demo-") ||
    /^m\d+$/.test(id) ||
    /^t\d+$/.test(id) ||
    /^g\d+$/.test(id) ||
    /^l\d+$/.test(id)
  );
}
