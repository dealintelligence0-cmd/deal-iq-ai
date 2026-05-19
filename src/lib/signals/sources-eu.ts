/**
 * EU regulated-information adapter.
 *
 * ESMA's "Officially Appointed Mechanism" (OAM) network requires going through
 * national depositories (UK FCA, German Bundesanzeiger, French AMF, etc) —
 * each has its own API and no unified EU-wide search exists for free.
 *
 * For Phase 4b we use the European Securities and Markets Authority public
 * register lookup. This identifies the LEI (Legal Entity Identifier) and
 * country of supervision; the actual filings come from each country's OAM.
 *
 * GLEIF (Global LEI Foundation) provides the free LEI lookup:
 *   https://api.gleif.org/api/v1/lei-records
 *
 * For the EU adapter, we currently support:
 *   - LEI lookup by company name → routes to country-specific source
 *   - Basic structured corporate event search via GLEIF data
 *
 * Full transcript / annual-report ingestion for EU companies requires
 * either a paid AlphaSense subscription OR per-country scraping (Phase 6+).
 */

import type { FilingMeta } from "./sources";

/**
 * Look up the LEI for a company by name via GLEIF.
 * Returns the 20-char LEI string or null.
 */
export async function lookupEuLei(companyName: string): Promise<{ lei: string; country: string } | null> {
  if (!companyName) return null;
  try {
    const r = await fetch(
      `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=${encodeURIComponent(companyName)}&page[size]=1`,
      { headers: { Accept: "application/vnd.api+json" } }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const first = j?.data?.[0];
    if (!first) return null;
    return {
      lei: first.attributes?.lei ?? first.id ?? "",
      country: first.attributes?.entity?.legalAddress?.country ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * List EU corporate events for a given LEI.
 *
 * NOTE: This is currently a stub returning empty. A full implementation would
 * route to per-country OAM endpoints based on the LEI's home country:
 *   - DE → bundesanzeiger.de
 *   - FR → amf-france.org
 *   - IT → consob.it
 *   - ES → cnmv.es
 *   - NL → afm.nl
 *
 * Each country's depository has different request patterns. We surface the
 * LEI on the watchlist UI so users know we've identified the entity, but
 * full filing coverage is Phase 6+ work.
 */
export async function listEuFilings(_lei: string, _maxItems = 10): Promise<FilingMeta[]> {
  return [];
}
