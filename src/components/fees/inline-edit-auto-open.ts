/**
 * InlineEditCell dropdown-like editors must open on the first click
 * (cases status column pattern). multiColorSelect previously omitted this.
 */
const AUTO_OPEN_TYPES = new Set([
  "select",
  "colorSelect",
  "multiColorSelect",
  "datetime",
]);

export function shouldAutoOpenOnEnter(type: string): boolean {
  return AUTO_OPEN_TYPES.has(type);
}
