/**
 * The GoodGuys interview scorecard, as data.
 *
 * Ported from the standalone goodguys-interview-scorecard HTML tool. The form,
 * the scoring, and the PDF export all render from these definitions so the
 * question set exists in exactly one place — reword a question here and every
 * surface follows.
 *
 * Scoring: the 6 core-value questions and 3 theoreticals are scored 1-5.
 * Sections 1-3 are captured but not scored.
 */

export const POSITIONS = [
  { value: 'mover_helper', label: 'Mover / Helper' },
  { value: 'driver', label: 'Driver' },
  { value: 'cdl_driver', label: 'CDL Driver' },
  { value: 'crew_lead', label: 'Crew Lead' },
] as const;

export const RECOMMENDATIONS = [
  { value: 'advance', label: 'Advance to Trial' },
  { value: 'maybe', label: 'Maybe — Second Opinion' },
  { value: 'pass', label: 'Pass', warn: true },
] as const;

/** A pill group: pick one. `warn` marks the answer that should draw the eye. */
export interface PillField {
  key: string;
  label: string;
  options: Array<{ label: string; warn?: boolean }>;
}

export interface TextField {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}

// ── Section 1 · Moving Experience ────────────────────────────────────────────

export const MOVING_TEXT_FIELDS: TextField[] = [
  { key: 'years_moving', label: 'Years of Moving Experience', placeholder: 'e.g. 2 years' },
  { key: 'previous_companies', label: 'Previous Companies', placeholder: 'Company names' },
];

export const MOVING_PILLS: PillField[] = [
  {
    key: 'pad_wrapping',
    label: 'Pad-Wrapping Furniture',
    options: [{ label: 'Experienced' }, { label: 'Some' }, { label: 'None', warn: true }],
  },
  {
    key: 'packing',
    label: 'Packing (Boxes / Kitchens)',
    options: [{ label: 'Experienced' }, { label: 'Some' }, { label: 'None', warn: true }],
  },
  {
    key: 'truck_stacking',
    label: 'Truck Stacking / Loading',
    options: [{ label: 'Experienced' }, { label: 'Some' }, { label: 'None', warn: true }],
  },
  {
    key: 'specialty_items',
    label: 'Specialty Items (Piano / Hot Tub / Safes)',
    options: [{ label: 'Yes' }, { label: 'No' }],
  },
  {
    key: 'multi_day',
    label: 'Comfortable with Multi-Day & Long-Distance Jobs?',
    options: [{ label: 'Yes' }, { label: 'Maybe' }, { label: 'No', warn: true }],
  },
];

// ── Section 2 · Driving Experience & Record ──────────────────────────────────

export const DRIVING_PILLS: PillField[] = [
  {
    key: 'license_class',
    label: 'License Class',
    options: [
      { label: 'Class C' },
      { label: 'CDL-B' },
      { label: 'CDL-A' },
      { label: 'None / Suspended', warn: true },
    ],
  },
  {
    key: 'personal_vehicle',
    label: 'Reliable Personal Vehicle?',
    options: [{ label: 'Yes' }, { label: 'No', warn: true }],
  },
  {
    key: 'box_truck',
    label: 'Box Truck Experience (16–26 ft)',
    options: [{ label: 'Extensive' }, { label: 'Some' }, { label: 'None', warn: true }],
  },
  {
    key: 'dot_medical',
    label: 'DOT Medical Card',
    options: [{ label: 'Current' }, { label: 'Willing to Get' }, { label: 'No', warn: true }],
  },
  {
    key: 'dui',
    label: 'DUI / Major Violations Ever?',
    options: [{ label: 'None' }, { label: 'Yes (note below)', warn: true }],
  },
  {
    key: 'mvr_pull',
    label: 'OK with MVR (Driving Record) Pull?',
    options: [{ label: 'Yes' }, { label: 'Hesitant / No', warn: true }],
  },
];

export const DRIVING_TEXT_FIELDS: TextField[] = [
  { key: 'years_driving', label: 'Years Driving Trucks', placeholder: 'e.g. 3' },
  { key: 'accidents', label: 'Accidents (Last 3 Years)', placeholder: 'Number + details' },
  { key: 'violations', label: 'Tickets / Violations (Last 3 Years)', placeholder: 'Number + details' },
];

// ── Section 3 · Policy Walkthrough ───────────────────────────────────────────

export interface PolicyItem {
  key: string;
  title: string;
  detail: string;
}

export const POLICY_WALKTHROUGH: PolicyItem[] = [
  {
    key: 'uniform',
    title: 'Uniform: khaki pants or khaki shorts',
    detail:
      "We provide the GoodGuys polo. You show up in khakis — clean, no rips. You are our brand in the customer's home.",
  },
  {
    key: 'start_time',
    title: '7:15 AM start time, every day',
    detail:
      'On time means early. Consistent tardies delay pay raises and can end the trial period.',
  },
  {
    key: 'smoking',
    title: 'No smoking on the job — and no smelling like smoke',
    detail: "Includes clothes and breath. We're inside customers' homes all day.",
  },
  {
    key: 'attendance',
    title: 'Attendance: no same-day call-outs, no no-call-no-shows',
    detail:
      'Either one delays raises. A no-call-no-show is grounds for ending the trial. If life happens, communicate early.',
  },
  {
    key: 'pay',
    title: 'Pay: starts at $18/hr with a skills-based path up',
    detail:
      'Raises earned through certifications (wrapping, packing, stacking), driving, crew lead, bilingual, specialty items. Damages and incidents delay progression.',
  },
  {
    key: 'bonus_pool',
    title: 'Quarterly bonus pool tied to damages',
    detail:
      'The crew shares accountability — damages within policy windows come out of the shared bonus pool. Skin in the game on every move.',
  },
  {
    key: 'trial',
    title: 'Month-long trial period',
    detail:
      "Increasing jobs over ~4 weeks. It's a two-way fit check — the crew vets you, you vet us.",
  },
  {
    key: 'background_check',
    title: 'Background check consent',
    detail: 'Criminal background and driving record review before trial starts.',
  },
];

// ── Sections 4 & 5 · Scored questions ────────────────────────────────────────

export interface ScoredQuestion {
  key: string;
  tag: string;
  /** Theoreticals are read aloud verbatim and styled differently. */
  red?: boolean;
  question: string;
  anchor: string;
  listenFor?: string;
  redFlags?: string;
  /** An extra free-text field shown above the score row. */
  extraField?: TextField;
}

export const CORE_VALUE_QUESTIONS: ScoredQuestion[] = [
  {
    key: 'radical_hospitality',
    tag: 'Radical Hospitality',
    question:
      'Tell me about a time you went out of your way to make someone feel genuinely taken care of — not just served. What drove you to do that?',
    anchor: '5 = specific person, specific action, genuine motive',
  },
  {
    key: 'people_over_profit',
    tag: 'People over Profit',
    question:
      'Have you ever been in a situation where doing right by a customer or coworker cost you something — time, money, convenience? What did you do?',
    anchor: '5 = names the real cost and paid it anyway',
  },
  {
    key: 'do_the_right_thing',
    tag: 'Do the Right Thing',
    question:
      'Tell me about a mistake you made on the job. How did you handle it, and who did you tell?',
    anchor: '5 = owns it fully, told someone before being caught',
  },
  {
    key: 'always_learning',
    tag: 'Always be Learning',
    question:
      "What's something you've gotten meaningfully better at in the last year — and how did you go about improving?",
    anchor: '5 = concrete skill, deliberate method, real progress',
  },
  {
    key: 'communication',
    tag: 'Communication is Key',
    question:
      'Tell me about a time a miscommunication caused a problem. What happened, and what would you do differently?',
    anchor: '5 = owns their side, specific fix going forward',
  },
  {
    key: 'no_complaints',
    tag: 'No Complaints without Solutions',
    question:
      'Tell me about a time something went wrong and you brought the problem to your boss. Did you come with a solution, or just the problem? What happened?',
    anchor: '5 = brought a workable fix, not just the gripe',
  },
];

export const THEORETICAL_QUESTIONS: ScoredQuestion[] = [
  {
    key: 'the_scratch',
    tag: 'The Scratch',
    red: true,
    question:
      "\"You're carrying a dresser and you scratch the customer's hardwood floor. It's small, it's in a corner, the customer didn't see it, and honestly they might never notice. Here's the thing — at our company, damages come out of a quarterly bonus pool, so reporting it costs money for you AND the whole crew. What do you do, and what do you say to your crew lead?\"",
    listenFor:
      'Acknowledges the temptation out loud ("man, that\'s tough...") and still lands on reporting it. That\'s a stronger honesty signal than an instant, frictionless "I\'d report it immediately" — which is often the coached answer.',
    redFlags:
      'Rationalizing ("if they\'d never notice, is it really damage?"), blaming ("depends if the truck was packed wrong"), or asking what the odds of getting caught are.',
    anchor: '5 = feels the pull, reports it anyway, tells the lead directly',
  },
  {
    key: 'best_mover',
    tag: 'The Best Mover on the Crew',
    red: true,
    question:
      "\"You're on a crew with a guy who's the strongest, fastest mover we've got — genuinely the best. But he's short with customers, and you've noticed he skips full pad-wrapping when he thinks nobody's checking. The crew lead hasn't said anything. You're the new guy — you have zero authority here. What, if anything, do you do?\"",
    listenFor:
      'Addresses the guy directly and privately first, brings it up as a solution rather than a gripe ("want me to grab pads for that side?"), and distinguishes a style issue from a standards issue.',
    redFlags:
      '"Not my problem, I\'m new" (bystander). Escalating to the boss without ever talking to the guy. Worst: admiring the shortcut ("if he\'s that fast, that\'s why he\'s the best").',
    anchor: '5 = moral courage + tact, person first, standards held',
  },
  {
    key: 'trade_off',
    tag: 'The Trade-Off',
    red: true,
    question:
      '"End of a long move day, you can only guarantee three of these four things — one will slip. Rank them, most to least important, and tell me why: finishing on schedule, zero damage, the customer feeling genuinely taken care of, the crew ending the day in good shape." (Tell them: there\'s no single right answer.)',
    listenFor:
      'Customer experience and zero damage near the top. Can articulate the "why" ("we can apologize for late — we can\'t un-break a hutch"). A little pushback on the premise shows standards.',
    redFlags:
      'Schedule ranked first (wrong wiring for our brand). Refusing to engage with the trade-off at all ("I\'d just do all four"). No reasoning behind the ranking.',
    extraField: {
      key: 'ranking',
      label: 'Their Ranking (1 → 4)',
      placeholder: 'e.g. Customer > Damage > Crew > Schedule',
    },
    anchor: '5 = clear reasoning that matches our brand',
  },
];

export const ALL_SCORED_QUESTIONS = [...CORE_VALUE_QUESTIONS, ...THEORETICAL_QUESTIONS];
export const MAX_SCORE = ALL_SCORED_QUESTIONS.length * 5;

// ── Scoring ──────────────────────────────────────────────────────────────────

export type FitBand = 'strong_fit' | 'solid' | 'borderline' | 'not_a_fit';

export const FIT_BAND_LABELS: Record<FitBand, string> = {
  strong_fit: 'STRONG FIT',
  solid: 'SOLID — TRIAL WILL TELL',
  borderline: 'BORDERLINE',
  not_a_fit: 'LIKELY NOT A FIT',
};

/**
 * Band thresholds are on the AVERAGE of the questions actually scored, not the
 * total — a half-finished sheet shouldn't read as a weak candidate.
 * Matches the original tool: >=4.2 strong, >=3.3 solid, >=2.5 borderline.
 */
export function fitBandFor(total: number, scoredCount: number): FitBand | null {
  if (scoredCount === 0) return null;
  const avg = total / scoredCount;
  if (avg >= 4.2) return 'strong_fit';
  if (avg >= 3.3) return 'solid';
  if (avg >= 2.5) return 'borderline';
  return 'not_a_fit';
}

/** Totals the 1-5 scores held in a scorecard's `responses.scores` map. */
export function tallyScores(scores: Record<string, number | undefined>): {
  total: number;
  scoredCount: number;
  band: FitBand | null;
} {
  let total = 0;
  let scoredCount = 0;
  for (const q of ALL_SCORED_QUESTIONS) {
    const v = scores[q.key];
    if (typeof v === 'number' && v >= 1 && v <= 5) {
      total += v;
      scoredCount++;
    }
  }
  return { total, scoredCount, band: fitBandFor(total, scoredCount) };
}
