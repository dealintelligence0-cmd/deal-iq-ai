export type TestCase = {
  input: string;
  expectedCurrency: string;
  expectedNativeMin?: number;
  expectedNativeMax?: number;
  expectedStake?: number | null;
  description: string;
};

export const VALUE_TEST_CASES: TestCase[] = [
  { input: "$250M", expectedCurrency: "USD", expectedNativeMin: 2.49e8, expectedNativeMax: 2.51e8, description: "Simple USD millions" },
  { input: "USD 250 Million", expectedCurrency: "USD", expectedNativeMin: 2.49e8, expectedNativeMax: 2.51e8, description: "ISO code + word scale" },
  { input: "€1.2B", expectedCurrency: "EUR", expectedNativeMin: 1.19e9, expectedNativeMax: 1.21e9, description: "EUR billions" },
  { input: "£500k", expectedCurrency: "GBP", expectedNativeMin: 499e3, expectedNativeMax: 501e3, description: "GBP thousands" },
  { input: "₹800 Cr", expectedCurrency: "INR", expectedNativeMin: 7.99e9, expectedNativeMax: 8.01e9, description: "INR crore" },
  { input: "INR 500 crore", expectedCurrency: "INR", expectedNativeMin: 4.99e9, expectedNativeMax: 5.01e9, description: "INR word scale" },
  { input: "Rs. 25 lakh", expectedCurrency: "INR", expectedNativeMin: 24.9e5, expectedNativeMax: 25.1e5, description: "Rs shorthand + lakh" },
  { input: "₹800 Cr for 49%", expectedCurrency: "INR", expectedNativeMin: 7.99e9, expectedNativeMax: 8.01e9, expectedStake: 49, description: "Stake inline in INR" },
  { input: "$500M for 75%", expectedCurrency: "USD", expectedNativeMin: 499e6, expectedNativeMax: 501e6, expectedStake: 75, description: "Stake inline in USD" },
  { input: "~$1.5B", expectedCurrency: "USD", expectedNativeMin: 1.49e9, expectedNativeMax: 1.51e9, description: "Approximate" },
  { input: "$1-2B", expectedCurrency: "USD", expectedNativeMin: 1.49e9, expectedNativeMax: 1.51e9, description: "Range midpoint" },
  { input: "JPY 10 billion", expectedCurrency: "JPY", expectedNativeMin: 9.9e9, expectedNativeMax: 10.1e9, description: "Japanese Yen" },
  { input: "5 bn", expectedCurrency: "USD", expectedNativeMin: 4.99e9, expectedNativeMax: 5.01e9, description: "No currency → USD default" },
  { input: "HK$ 100M", expectedCurrency: "HKD", expectedNativeMin: 99e6, expectedNativeMax: 101e6, description: "Hong Kong Dollar" },
  { input: "CHF 50M", expectedCurrency: "CHF", expectedNativeMin: 49e6, expectedNativeMax: 51e6, description: "Swiss Franc" },
];
