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
  effects: EffectPick[]; narrative: string; printedRating?: number; vehicle?: string }
export interface VehicleBase extends Ref { name: string; pilot: number; body: number;
  handling: number; speed: number; flyingSpeed?: number; armor: number; mount: string }
export interface Package extends Ref { name: string; level: string; archetype: string;
  attrPoints: number; attrAtMax: number; skillPoints: number; skillsAtSix: number;
  ampPoints: number; armor: number; standardWeapons: number; specialistWeapons: number;
  equipment: number; spells: number }
export type ItemKind = 'gear' | 'weapon' | 'armor' | 'spell' | 'complex-form';
export interface Item extends Ref { name: string; kind: ItemKind; specialist?: boolean;
  armor?: number; dv?: string; ranges?: string; category?: string; text: string }
export interface Lifestyle extends Ref { name: string; perRun: number; text: string }
/** a book or document the data comes from; canon = the game's official rules (sources.xml) */
export interface Source { id: string; name: string; publisher: string; canon: boolean; texts?: string }
/** rules reference entry (quick-reference sheets); effects = amp effects it explains */
export interface Rule extends Ref { sheet: string; section: string; title: string; effects: string[]; text: string }
export interface LoadError { file: string; line?: number; message: string }
export interface Catalog {
  levels: Map<string, Level>; metatypes: Map<string, Metatype>;
  attributes: Map<AttrId, Attribute>; skills: Map<string, Skill>; pricing: Pricing;
  ampTypes: Map<string, AmpType>; ampEffects: Map<string, AmpEffect>;
  amps: Map<string, AmpTemplate>; vehicles: Map<string, VehicleBase>;
  packages: Map<string, Package>; items: Map<string, Item>; lifestyles: Map<string, Lifestyle>;
  sources: Map<string, Source>; rules: Map<string, Rule>;
  files: { file: string; kind: string; entries: number; overlay: boolean }[];
  errors: LoadError[];
}

// ---- character ----
export interface EffectPick { ref: string; param?: string; value?: number; note?: string }
/** specs: spec ids ("stealth.physical-sneaking") or "custom:Name" */
export interface SkillEntry { id: string; rating: number; specs: string[] }
export interface AmpEntry { uid: string; catalogId?: string; type: string; name: string;
  narrative: string; effects: EffectPick[]; linkedItem?: string; vehicle?: string;
  snapshot?: AmpTemplate }
/** dv/ranges: set when the item came with a book amp (already includes that amp's upgrades) */
export interface ItemEntry { uid: string; catalogId?: string; kind: ItemKind; name: string;
  specialist?: boolean; armor?: number; dv?: string; ranges?: string; price?: number; snapshot?: Item }
export interface Build { attributes: Record<AttrId, number>; skills: SkillEntry[];
  knowledge: string[]; amps: AmpEntry[]; items: ItemEntry[];
  mainArmor?: string; altArmor?: string }
export type CareerEvent = { id: string; at: string } & (
  | { type: 'earn'; amount: number; run: string; date: string }
  | { type: 'advance'; path: string; from: number; to: number; cost: number }
  | { type: 'buy'; item: ItemEntry; cost: number }
  | { type: 'sell'; itemUid: string }
  | { type: 'amp-add'; amp: AmpEntry; cost: number }
  | { type: 'amp-modify'; ampUid: string; before: AmpEntry; after: AmpEntry; cost: number }
  | { type: 'spec-add'; skill: string; spec: string; cost: number }
  | { type: 'knowledge-add'; name: string; cost: number }
  | { type: 'note'; text: string }
  | { type: 'void'; eventId: string; reason: string });
export interface Override { code: string; path: string; note: string }
export interface Character { formatVersion: 1; id: string;
  identity: { name: string; streetName: string; metatype: string; portrait?: string; lifestyle?: string;
    background: string; notes: string };
  narrative: { keywords: string[]; dispositions: string[]; cues: string[] };
  level: string; package: string; build: Build; finalizedAt?: string;
  /** false: non-canon catalog content is flagged (undefined = allowed) */
  allowNonCanon?: boolean;
  /** source id of a sample character (sources.xml), e.g. CRB or PREGENS */
  origin?: string;
  /** creation nuyen left over when finalized; the career balance starts here */
  finalRemaining?: number;
  career: CareerEvent[]; overrides: Override[]; lastExportedAt?: string; updatedAt: string }
export type Severity = 'error' | 'warning';
export interface Violation { code: string; severity: Severity; path: string;
  message: string; source?: string; page?: number; approved?: boolean }

/** crypto.randomUUID only exists in secure contexts; plain-http LAN hosting needs a fallback. */
export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
