

export function validateRequiredSections(content: string, requiredSections: string[]): { ok: boolean; missing: string[] } {
  const missing = requiredSections.filter((section) => !content.includes(`## ${section}`));
  return { ok: missing.length === 0, missing };
}
