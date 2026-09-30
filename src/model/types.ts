// Shared vocabulary for engine and UI. Catalog types mirror the XML data kinds
// (docs/data-format.md); Character types mirror the .ca2.json file.

export type AttrId = 'str' | 'agi' | 'wil' | 'log' | 'cha';
export const ATTRS: AttrId[] = ['str', 'agi', 'wil', 'log', 'cha'];
export interface Ref { id: string; source: string; page: number }

export interface Level extends Ref { name: string; nuyen: number; attrAtMax: number;
  skillCap: number; rrAttr: number; rrSkill: number; rrSpec: number }
export interface Metatype extends Ref { name: string; edge: number;
  ranges: Record<AttrId, [number, number]>; racialQuality: string }
export interface Attribute extends Ref { name: string; abbr: string }
/** source/page: set when the spec comes from another book than its skill */
export interface Spec { id: string; name: string; attr: AttrId; source?: string; page?: number }
export interface Skill extends Ref { name: string; attr: AttrId; alt?: AttrId;
  requires?: 'awakened' | 'cyberdeck' | 'emerged'; specs: Spec[] }
export interface Pricing { attrPoint: number; attrLastPoint: number;
  skillLow: number; skillLowMax: number; skillHigh: number; spec: number;
  knowledge: number; ampPoint: number; equipment: number; weaponStandard: number;
  weaponSpecialist: number; armorPoint: number; spell: number; complexForm: number; refundEffectRemoval: boolean }
export interface AmpType extends Ref { name: string; base: number; baseAfterFirst?: number;
  essence: number; requires?: string }
export type EffectParam = 'skill' | 'spec' | 'attribute' | 'realm' | 'text' | 'value';
export interface AmpEffect extends Ref { name: string; category: string; rating: number;
  types: string[]; max?: number; requires?: string; excludes?: string;
  param?: EffectParam; gmApproval?: boolean;
  /** change to the amp's Essence cost (implant grades) */
  essence?: number }
/** base item bought with an equipment amp; priced from pricing.xml */
export interface TemplateItem { kind: 'gear' | 'weapon' | 'armor'; specialist?: boolean;
  armor?: number; dv?: string; ranges?: string }
/** mod: an add-on applied to an existing amp of `type` (ammo, accessories, vehicle mods, grades) */
export interface AmpTemplate extends Ref { name: string; type: string; item?: TemplateItem; mod?: boolean;
  effects: EffectPick[]; narrative: string; printedRating?: number; vehicle?: string; edited?: boolean }
export interface VehicleBase extends Ref { name: string; pilot: number; body: number;
  handling: number; speed: number; flyingSpeed?: number; armor: number; mount: string }
export interface Package extends Ref { name: string; level: string; archetype: string;
  attrPoints: number; attrAtMax: number; skillPoints: number; skillsAtSix: number;
  ampPoints: number; armor: number; standardWeapons: number; specialistWeapons: number;
  equipment: number; spells: number }
export type ItemKind = 'gear' | 'weapon' | 'armor' | 'spell' | 'complex-form';
export interface Item extends Ref { name: string; kind: ItemKind; specialist?: boolean;
  armor?: number; dv?: string; ranges?: string; category?: string; text: string; edited?: boolean }
export interface Lifestyle extends Ref { name: string; perRun: number; text: string }
/** a book or document the data comes from; canon = the game's official rules (sources.xml) */
/** origin: which sources file defined it last (shipped public/data, generated custom/imported, the user's custom).
 * Imported sources also carry the uploaded file name(s) ("; "-separated), SHA-256(s) (space-separated) and import date. */
export interface Source { id: string; name: string; publisher: string; canon: boolean; texts?: string;
  file?: string; sha256?: string; imported?: string; origin: 'shipped' | 'imported' | 'user' }
/** rules reference entry (quick-reference sheets); effects = amp effects it explains */
export interface Rule extends Ref { sheet: string; section: string; title: string; effects: string[]; text: string; edited?: boolean }
export interface LoadError { file: string; line?: number; message: string }
export interface Catalog {
  levels: Map<string, Level>; metatypes: Map<string, Metatype>;
  attributes: Map<AttrId, Attribute>; skills: Map<string, Skill>; pricing: Pricing;
  ampTypes: Map<string, AmpType>; ampEffects: Map<string, AmpEffect>;
  amps: Map<string, AmpTemplate>; vehicles: Map<string, VehicleBase>;
  packages: Map<string, Package>; items: Map<string, Item>; lifestyles: Map<string, Lifestyle>;
  sources: Map<string, Source>; rules: Map<string, Rule>;
  /** the entries the edits layer (custom/edits/edits.xml) replaced, by id; the replacements carry edited: true */
  original: { amps: Map<string, AmpTemplate>; items: Map<string, Item>; rules: Map<string, Rule> };
  files: { file: string; kind: string; entries: number; overlay: boolean }[];
  errors: LoadError[];
  /** core files found neither in data/ nor custom/imported/core/ (loadCatalog): the app opens on its setup screen */
  coreMissing: string[];
}

// ---- character ----
export interface EffectPick { ref: string; param?: string; value?: number; note?: string }
/** specs: spec ids ("stealth.physical-sneaking") or "custom:Name" */
export interface SkillEntry { id: string; rating: number; specs: string[] }
/** realSin: added by the Concept tab's "Has a real SIN" box (removed with it; free, like every SINner: house rule) */
export interface AmpEntry { uid: string; catalogId?: string; type: string; name: string;
  narrative: string; effects: EffectPick[]; linkedItem?: string; vehicle?: string;
  snapshot?: AmpTemplate; realSin?: true }
/** Free gear no one buys: every runner's commlink and fake SIN (CRB p.85), and the real SIN of a runner that has one. */
export type StartingGear = 'commlink' | 'fake-sin' | 'real-sin'
/** dv/ranges: set when the item came with a book amp (already includes that amp's upgrades).
 *  starting: free starting gear (costs nothing, can't be removed or sold); note: the player's description.
 *  over: an armor add-on worn over another armor item (its uid), a mask or a helmet: `armor` is the points it adds (and
 *  pays for); worn, it counts on top of that item's. */
export interface ItemEntry { uid: string; catalogId?: string; kind: ItemKind; name: string;
  specialist?: boolean; armor?: number; dv?: string; ranges?: string; price?: number; snapshot?: Item;
  starting?: StartingGear; note?: string; over?: string }
/** A knowledge skill or language. from: the free slot it fills ("skill:<id>" at rating 4+, "keyword:<the keyword>");
 *  none, or a skill slot whose skill is below 4, costs the pricing file's knowledge price.
 *  native: the runner's native language, free (one per runner).
 *  id: a paid entry's own key for its place and hidden mark (a free slot's is its `from`). */
export interface KnowledgeEntry { name: string; kind: 'knowledge' | 'language'; from?: string; native?: true; id?: string }
/** knowledgeOrder: row keys (knowledgeKey) in the player's order, both lists; rows not in it follow A–Z.
 *  knowledgeHidden: row keys left off the printed sheet. */
export interface Build { attributes: Record<AttrId, number>; skills: SkillEntry[];
  knowledge: KnowledgeEntry[]; amps: AmpEntry[]; items: ItemEntry[];
  mainArmor?: string; altArmor?: string; knowledgeOrder?: string[]; knowledgeHidden?: string[] }
/** One thing a finalized runner's edit changed (engine/career.ts diffBuild). from absent: added; to absent: removed. */
export interface Change { key: string; label: string; from?: string; to?: string }
/** The ledger. finalize: "Creation finished · N¥ left"; change: an edit after Finalize, logged automatically, cost =
 *  what it charged (negative: refunded). prices: what each thing (price.ts priceParts keys) was paid, as of that entry:
 *  the whole build on finalize, the things that change touched on change; a removal refunds that. earn, note, void. advance to knowledge-add: how runners finalized before
 *  0.5.5 recorded changes, kept as history (career.ts settle). */
export type CareerEvent = { id: string; at: string } & (
  | { type: 'earn'; amount: number; run: string; date: string }
  | { type: 'finalize'; remaining: number; prices?: Record<string, number> }
  | { type: 'change'; changes: Change[]; cost: number; prices?: Record<string, number> }
  | { type: 'advance'; path: string; from: number; to: number; cost: number }
  | { type: 'buy'; item: ItemEntry; cost: number }
  | { type: 'sell'; itemUid: string }
  | { type: 'amp-add'; amp: AmpEntry; cost: number }
  | { type: 'amp-modify'; ampUid: string; before: AmpEntry; after: AmpEntry; cost: number }
  | { type: 'spec-add'; skill: string; spec: string; cost: number }
  /** from: renames (cost 0) or pays for (cost > 0, the entry becomes a paid one) the entry filling that slot */
  | { type: 'knowledge-add'; name: string; kind?: KnowledgeEntry['kind']; from?: string; cost: number }
  | { type: 'note'; text: string }
  | { type: 'void'; eventId: string; reason: string });
export interface Override { code: string; path: string; note: string }
/** Built-in portrait backdrops (src/ui/Portrait.tsx, app.css .bd-*); none = no backdrop, the look before 0.5.4 */
export const BACKDROPS = ['white', 'grey', 'dark', 'grid', 'halftone', 'neon', 'rain'] as const
export type Backdrop = typeof BACKDROPS[number]
export interface Character { formatVersion: 1; id: string;
  identity: { name: string; streetName: string; metatype: string; portrait?: string; backdrop?: Backdrop; lifestyle?: string;
    background: string; notes: string };
  narrative: { keywords: string[]; dispositions: string[]; cues: string[] };
  level: string; package: string; build: Build; finalizedAt?: string;
  /** false: non-canon catalog content is flagged (undefined = allowed) */
  allowNonCanon?: boolean;
  /** source id of a sample character (sources.xml), e.g. CRB or PREGENS */
  origin?: string;
  /** which example character this runner is a copy of: "<name slug>|canon" or "<name slug>|noncanon" (src/ui/samples.ts);
   *  0.4.1 wrote "<source>.<name slug>". Loading the examples again skips every key already in the library */
  sampleKey?: string;
  /** the campaign it plays in (server only, set through /api/campaigns; a copy is in none) */
  campaign?: string;
  /** creation nuyen left over when finalized */
  finalRemaining?: number;
  /** a reopened runner only (engine/career.ts reopen): what its ledger's balance held beyond budget - build price; it
   *  counts in what's left to spend and the next Finalize uses it up */
  carry?: number;
  career: CareerEvent[]; overrides: Override[]; lastExportedAt?: string; updatedAt: string }
export type Severity = 'error' | 'warning';
export interface Violation { code: string; severity: Severity; path: string;
  message: string; source?: string; page?: number; approved?: boolean }

/** crypto.randomUUID only exists in secure contexts; plain-http LAN hosting needs a fallback. */
export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
