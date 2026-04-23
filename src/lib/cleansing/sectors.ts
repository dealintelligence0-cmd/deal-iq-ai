/** Map messy sector values to a standard taxonomy (GICS-inspired, simplified). */
const SECTOR_MAP: Record<string, string> = {
  tech: "Technology",
  technology: "Technology",
  it: "Technology",
  software: "Technology",
  saas: "Technology",
  internet: "Technology",
  telecom: "Telecommunications",
  telecommunications: "Telecommunications",
  healthcare: "Healthcare",
  health: "Healthcare",
  pharma: "Healthcare",
  pharmaceutical: "Healthcare",
  biotech: "Healthcare",
  "life sciences": "Healthcare",
  medical: "Healthcare",
  finance: "Financial Services",
  financial: "Financial Services",
  "financial services": "Financial Services",
  banking: "Financial Services",
  insurance: "Financial Services",
  fintech: "Financial Services",
  energy: "Energy",
  oil: "Energy",
  "oil & gas": "Energy",
  gas: "Energy",
  renewable: "Energy",
  power: "Energy",
  utilities: "Utilities",
  industrial: "Industrials",
  industrials: "Industrials",
  manufacturing: "Industrials",
  aerospace: "Industrials",
  defense: "Industrials",
  automotive: "Consumer Discretionary",
  retail: "Consumer Discretionary",
  consumer: "Consumer Discretionary",
  "consumer discretionary": "Consumer Discretionary",
  ecommerce: "Consumer Discretionary",
  media: "Communication Services",
  entertainment: "Communication Services",
  communication: "Communication Services",
  "communication services": "Communication Services",
  "consumer staples": "Consumer Staples",
  food: "Consumer Staples",
  beverage: "Consumer Staples",
  fmcg: "Consumer Staples",
  "real estate": "Real Estate",
  realestate: "Real Estate",
  property: "Real Estate",
  reit: "Real Estate",
  materials: "Materials",
  chemicals: "Materials",
  mining: "Materials",
  metals: "Materials",
  construction: "Materials",
  logistics: "Industrials",
  transportation: "Industrials",
  transport: "Industrials",
};

export function cleanSector(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;

  if (SECTOR_MAP[s]) return SECTOR_MAP[s];

  for (const key of Object.keys(SECTOR_MAP)) {
    if (s.includes(key)) return SECTOR_MAP[key];
  }
  // Fallback: title-case original
  return s.charAt(0).toUpperCase() + s.slice(1);
}
