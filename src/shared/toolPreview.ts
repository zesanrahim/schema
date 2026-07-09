export function toolInputPreview(input: Record<string, unknown>, max = 50): string {
  const val = input.file_path ?? input.command ?? input.pattern ?? Object.values(input)[0];
  if (typeof val !== "string") return "";
  return val.length > max ? val.slice(0, max) + "…" : val;
}
