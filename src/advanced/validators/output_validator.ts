

export function validateRequiredSections(content: string, requiredSections: string[]): { ok: boolean; missing: string[] } {
  const defaultSections = [
    "Executive Summary",
    "Value Creation & Synergies",
    "Risk & Mitigation",
    "Why NOT This Deal",
  ];
  const required = requiredSections.length > 0 ? requiredSections : defaultSections;
  const missing = required.filter((section) => !content.includes(`## ${section}`));
  const hasValueBridge = /revenue synergy.+cost synergy.+cost-to-achieve/i.test(content.replace(/\n/g, " "));
  if (!hasValueBridge) missing.push("Value Bridge (revenue + cost - cost-to-achieve)");
  return { ok: missing.length === 0, missing };
}
