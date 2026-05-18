/**
 * MBB Storyline Templates.
 *
 * Each template defines the slide ORDER and ARCHETYPE for an executive deck.
 * The PPTX exporter consumes these templates and reorganizes the markdown
 * sections to match. If a section doesn't exist in the input, the template
 * skips it gracefully (or generates a placeholder via the AI hook).
 *
 * Principles encoded:
 *   - Pyramid Principle: answer first, then key supporting arguments, then detail
 *   - Action Titles: every slide headline states the conclusion, not the topic
 *   - Issue Trees: top-down decomposition
 *   - Visual Hierarchy: one chart type per slide context
 */

export type SlideArchetype =
  | "cover"
  | "exec_summary"        // pyramid: 1 thesis + 3 supports
  | "situation_complication_resolution"   // SCR framework
  | "two_by_two"          // matrix slide
  | "synergy_bridge"      // waterfall chart
  | "market_map"          // competitive landscape
  | "timeline"            // milestones / phasing
  | "valuation_summary"
  | "risk_matrix"         // heatmap
  | "thesis"              // strategic thesis statement
  | "deal_score"          // KPI tiles
  | "scenario"            // base/upside/downside
  | "team"                // names + roles
  | "appendix_divider";

export type StorylineSlide = {
  archetype: SlideArchetype;
  action_title: string;       // "Wishcare strengthens L'Oréal's D2C beauty position" — states the conclusion
  source_section?: string;    // markdown heading to pull content from (case-insensitive contains match)
  required: boolean;          // if true and source missing, AI fills via prompt
  notes?: string;             // partner guidance
};

export type StorylineTemplate = {
  id: string;
  display_name: string;
  emoji: string;
  description: string;
  use_when: string;           // partner guidance on when to pick this
  slides: StorylineSlide[];
};

export const STORYLINE_TEMPLATES: StorylineTemplate[] = [
  {
    id: "executive_summary",
    display_name: "Executive Summary (MBB Pyramid)",
    emoji: "📊",
    description: "Lead with the answer. 6 slides. For senior partner / managing director review.",
    use_when: "Short partner-internal brief. CEO update. Quick committee read.",
    slides: [
      { archetype: "cover",        action_title: "{client} — {proposal_type}", required: true },
      { archetype: "exec_summary", action_title: "{thesis_one_liner}", source_section: "executive summary|thesis", required: true,
        notes: "Pyramid: 1 thesis + 3 supporting points." },
      { archetype: "deal_score",   action_title: "Score: {score}/100 — {verdict}", source_section: "deal score|score", required: false },
      { archetype: "synergy_bridge", action_title: "{synergy_value} synergy potential identified", source_section: "synergy|value drivers", required: false },
      { archetype: "risk_matrix",    action_title: "Top risks are mitigable through {key_mitigation}", source_section: "risk|key risks|why not", required: false },
      { archetype: "thesis",         action_title: "Recommendation: {recommendation}", source_section: "recommendation", required: true },
    ],
  },
  {
    id: "strategic_case",
    display_name: "Strategic Case for Acquisition",
    emoji: "🎯",
    description: "Full strategic case. 10 slides. For CFO / IC / board.",
    use_when: "Investment Committee submission. Board approval pack. Detailed buyer-side story.",
    slides: [
      { archetype: "cover",          action_title: "{client} — Strategic case for acquiring {target}", required: true },
      { archetype: "situation_complication_resolution", action_title: "{situation_one_liner}", source_section: "market|situation", required: true,
        notes: "SCR: Situation (where {client} is today) → Complication (what's changed) → Resolution (this deal)." },
      { archetype: "market_map",     action_title: "{target} occupies the {market_position} position in the value chain", source_section: "market|competitive", required: false },
      { archetype: "thesis",         action_title: "Acquisition rationale: {strategic_logic}", source_section: "thesis|rationale", required: true },
      { archetype: "two_by_two",     action_title: "{target} fills the gap in {key_capability_axis}", source_section: "capability|adjacency", required: false },
      { archetype: "valuation_summary", action_title: "Valuation supports a {price_range} offer", source_section: "valuation", required: false },
      { archetype: "synergy_bridge", action_title: "Synergies of {synergy_value} drive {payback} payback", source_section: "synergy", required: false },
      { archetype: "scenario",       action_title: "Base case IRR: {base_irr}", source_section: "scenario|case", required: false },
      { archetype: "risk_matrix",    action_title: "Risks are concentrated in {top_risk_category}", source_section: "risk", required: false },
      { archetype: "thesis",         action_title: "Recommendation: {recommendation}", source_section: "recommendation", required: true },
    ],
  },
  {
    id: "operating_transformation",
    display_name: "Operating Model Transformation",
    emoji: "⚙️",
    description: "Post-deal value-creation pitch. 8 slides. For operating partner / CEO.",
    use_when: "Post-LOI value creation pitch. Operating Partner brief. PE post-close kickoff.",
    slides: [
      { archetype: "cover",         action_title: "{target} — Operating Model Transformation Roadmap", required: true },
      { archetype: "exec_summary",  action_title: "{thesis_one_liner}", source_section: "executive summary", required: true },
      { archetype: "two_by_two",    action_title: "{target}'s current operating model trails peers on {gap}", source_section: "operating|operational", required: false },
      { archetype: "synergy_bridge",action_title: "Cost programs unlock {cost_savings} over 18 months", source_section: "cost|synergy", required: false },
      { archetype: "timeline",      action_title: "{phase_count}-phase transformation roadmap", source_section: "100|plan|roadmap", required: true,
        notes: "Show phase milestones, owners, decision gates." },
      { archetype: "risk_matrix",   action_title: "Execution risk is concentrated in {top_risk}", source_section: "risk", required: false },
      { archetype: "team",          action_title: "Team — {team_size} senior consultants across {workstream_count} workstreams", source_section: "team|approach", required: false },
      { archetype: "thesis",        action_title: "Total value-creation potential: {tvc_value}", source_section: "value|recommendation", required: true },
    ],
  },
  {
    id: "synergy_bridge_pitch",
    display_name: "Synergy Bridge Presentation",
    emoji: "💰",
    description: "Pure synergy pitch. 6 slides. For CFO / FP&A review.",
    use_when: "Synergy-focused conversation. Finance-led review. Bottom-up build-out.",
    slides: [
      { archetype: "cover",         action_title: "{buyer} + {target}: ${synergy_value} synergy opportunity", required: true },
      { archetype: "exec_summary",  action_title: "Three synergy categories drive {synergy_value} total value", source_section: "summary|synergy", required: true },
      { archetype: "synergy_bridge",action_title: "Cost synergies: {cost_synergy_value}", source_section: "cost", required: false },
      { archetype: "synergy_bridge",action_title: "Revenue synergies: {revenue_synergy_value}", source_section: "revenue", required: false },
      { archetype: "timeline",      action_title: "Synergy realization timeline: {time_to_run_rate} to run-rate", source_section: "timeline|phasing", required: false },
      { archetype: "risk_matrix",   action_title: "Realization risk is {risk_level} ({confidence})", source_section: "risk|confidence", required: false },
    ],
  },
  {
    id: "investment_committee",
    display_name: "Investment Committee Pack",
    emoji: "📋",
    description: "Full IC submission. 12 slides. For decision approval.",
    use_when: "IC submission. Approval pack. Most rigorous format.",
    slides: [
      { archetype: "cover",          action_title: "IC submission — {target} acquisition", required: true },
      { archetype: "exec_summary",   action_title: "{thesis_one_liner}", source_section: "executive|summary", required: true },
      { archetype: "situation_complication_resolution", action_title: "{situation_one_liner}", source_section: "market|context", required: false },
      { archetype: "market_map",     action_title: "Market structure favors {market_winner}", source_section: "market", required: false },
      { archetype: "thesis",         action_title: "Investment thesis: {strategic_logic}", source_section: "thesis|rationale", required: true },
      { archetype: "deal_score",     action_title: "Deal score: {score}/100", source_section: "score", required: false },
      { archetype: "valuation_summary", action_title: "Valuation: {valuation_range}", source_section: "valuation", required: false },
      { archetype: "synergy_bridge", action_title: "Synergies: {synergy_value}", source_section: "synergy", required: false },
      { archetype: "scenario",       action_title: "IRR: {base_irr} base / {upside_irr} upside", source_section: "scenario", required: false },
      { archetype: "risk_matrix",    action_title: "Risks: {risk_summary}", source_section: "risk", required: false },
      { archetype: "timeline",       action_title: "Path to close: {timeline}", source_section: "timeline|close", required: false },
      { archetype: "thesis",         action_title: "Recommendation: {recommendation}", source_section: "recommendation", required: true },
    ],
  },
  {
    id: "board_narrative",
    display_name: "Board-Grade Narrative",
    emoji: "📈",
    description: "Story-arc deck. 7 slides. Highest visual polish.",
    use_when: "Board meeting. CEO presentation. External advisory pitch.",
    slides: [
      { archetype: "cover",          action_title: "{client} growth strategy — adding {target}", required: true },
      { archetype: "situation_complication_resolution", action_title: "Today, {client} faces {key_pressure}", source_section: "market|context|situation", required: true },
      { archetype: "thesis",         action_title: "The strategic answer is {strategic_move}", source_section: "thesis", required: true },
      { archetype: "market_map",     action_title: "Why {target}: occupies the {position} in our adjacency strategy", source_section: "market|why", required: false },
      { archetype: "synergy_bridge", action_title: "Combined value: {combined_value}", source_section: "synergy|value", required: false },
      { archetype: "timeline",       action_title: "Path forward: {phase_count} phases over {duration}", source_section: "timeline|plan", required: false },
      { archetype: "thesis",         action_title: "Recommendation: {recommendation}", source_section: "recommendation", required: true },
    ],
  },
];

/** Find storyline by id; falls back to first template. */
export function getStoryline(id: string | null | undefined): StorylineTemplate {
  if (!id) return STORYLINE_TEMPLATES[0];
  return STORYLINE_TEMPLATES.find((t) => t.id === id) ?? STORYLINE_TEMPLATES[0];
}

/** Suggested chart for an archetype. */
export const ARCHETYPE_CHART: Record<SlideArchetype, string> = {
  cover: "title",
  exec_summary: "pyramid",
  situation_complication_resolution: "narrative",
  two_by_two: "matrix-2x2",
  synergy_bridge: "waterfall",
  market_map: "scatter-plot",
  timeline: "gantt-mini",
  valuation_summary: "table-comparables",
  risk_matrix: "heatmap-impact-probability",
  thesis: "callout",
  deal_score: "kpi-tile-grid",
  scenario: "stacked-bar",
  team: "card-grid",
  appendix_divider: "divider",
};
