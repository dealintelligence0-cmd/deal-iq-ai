"use client";

import { useState } from "react";
import {
  BookOpen, ChevronRight, Search, Rocket, Upload, GitMerge,
  AlertTriangle, Briefcase, Sparkles, FileText, Download, Shield,
  Settings as SettingsIcon, HelpCircle, Zap,
} from "lucide-react";

type Section = {
  id: string;
  title: string;
  icon: typeof BookOpen;
  content: { heading?: string; body: string; steps?: string[] }[];
};

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Rocket,
    content: [
      { heading: "Welcome to Deal IQ AI", body: "Deal IQ AI transforms raw M&A deal data into actionable intelligence. This 5-minute guide gets you from zero to your first enriched dataset." },
      { heading: "The 5-step workflow", body: "Every feature in Deal IQ follows this progression:", steps: [
        "Upload — drop CSV/XLSX files containing raw deal records",
        "Map — tell the system which column is the buyer, target, date, value, etc.",
        "Cleanse — automatic deduplication, date normalization, company name cleanup",
        "Enrich — AI scores every deal for priority, risk, and advisory attractiveness",
        "Export — download CSV/JSON/PDF/PPTX branded for client delivery",
      ]},
      { heading: "First-time setup", body: "Before uploading, spend 2 minutes in Settings to save a free AI key:", steps: [
        "Go to Settings in the sidebar",
        "Fast Tier: pick Groq → Get API key → console.groq.com → create free key → paste → Save → Auto-detect",
        "Smart Tier: pick Google → Get API key → aistudio.google.com → create free key → paste → Save → Auto-detect",
        "You now have free AI for enrichment AND premium proposals",
      ]},
    ],
  },
  {
    id: "uploads",
    title: "Uploading Data",
    icon: Upload,
    content: [
      { heading: "Supported formats", body: "CSV, XLSX, XLS, TXT, JSON. Max 50 MB per file. Multiple files can be uploaded at once." },
      { heading: "How to upload", body: "", steps: [
        "Sidebar → Uploads",
        "Drag files onto the drop zone, or click to browse",
        "Each file shows a Ready badge with row count",
        "Click the eye icon on any card to preview the first 25 rows",
        "Click Import to save raw files + parse metadata into Supabase",
      ]},
      { heading: "What happens after import", body: "The raw file is stored securely in your private Storage bucket. Only you can access it. The row count + column headers are saved to the uploads table so you can map columns without re-parsing." },
    ],
  },
  {
    id: "mapping",
    title: "Column Mapping",
    icon: GitMerge,
    content: [
      { heading: "Why mapping is required", body: "Different data providers use different column names: Buyer vs Acquirer vs Purchaser. The mapping step tells Deal IQ which source column represents each standard field." },
      { heading: "How to map", body: "", steps: [
        "Sidebar → Mapping",
        "Tick the files you want to merge → click Load N files",
        "System auto-detects most fields (look for green checkmarks)",
        "Fix any red-flagged required fields (Deal Date, Buyer, Target)",
        "Optionally type a name and click Save to create a reusable template",
        "Click Import N deals to cleanse + save to your Deals table",
      ]},
      { heading: "Saved templates", body: "After saving, the template appears in the Load Template dropdown at the top of the mapping grid. Reuse it on any future file with the same column layout — one click restores all mappings." },
      { heading: "What counts as a duplicate", body: "Rows with identical buyer + target + date (after cleansing) are treated as duplicates and skipped. The count shows in the import toast." },
    ],
  },
  {
    id: "exceptions",
    title: "Exceptions & Data Quality",
    icon: AlertTriangle,
    content: [
      { heading: "What are exceptions", body: "During import, every row passes through 8 cleansing rules. Any rule that fires logs an exception record. There are three severities:" },
      { heading: "Severity levels", body: "", steps: [
        "INFO (blue) — cosmetic fixes like suffix removal (Acme Corp → Acme)",
        "WARNING (amber) — suspicious values like $5M < deal < $500B range, or stake outside 0–100",
        "ERROR (red) — missing required fields that made the row unusable",
      ]},
      { heading: "Resolving exceptions", body: "Click Exceptions in the sidebar → filter by severity → click Resolve to archive. Resolved items disappear by default but can be shown with the toggle." },
    ],
  },
  {
    id: "pipeline",
    title: "Deal Pipeline",
    icon: Briefcase,
    content: [
      { heading: "Overview", body: "The Deals page is your enterprise pipeline table. Every imported and enriched deal appears here." },
      { heading: "Filtering", body: "Use the filter bar to narrow the view:", steps: [
        "Search — type buyer or target name (live filter)",
        "Sector / Country / Deal Type / Status — multi-dropdowns",
        "Date range — pick From and To",
        "Value range — enter Min and Max in $M",
      ]},
      { heading: "Sorting", body: "Click any column header to sort ascending. Click again for descending." },
      { heading: "Bulk actions", body: "Tick rows to select → Delete N or Export CSV of exactly what you see (filters + sort applied)." },
      { heading: "Deal detail page", body: "Click any buyer name → opens the full intelligence view with 11 sections: headline, buyer/target profiles, rationale, synergies, integration complexity, TSA, regulatory risks, comparables, advisory score." },
    ],
  },
];
