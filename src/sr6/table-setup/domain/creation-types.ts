// SR6 creation rules: the settings' value, layer and key types, and the shared namespace and switch constants (see creation.ts).
import { type Sr6Method } from '../../formats/domain/character'

export const CREATION_NS = 'urn:chummer-sr6:config:1'
/** The server's switch for the optional data set (custom/sr6/cl6only/, docs/sr6-cl6-optional-package.md): off by default;
 *  on, the catalog loads it (Sr6App, collectSr6Files). A campaign's or runner's value has no effect: the catalog is the
 *  server's. */
export const CL6_ONLY_KEY = 'cl6OnlyData'
/** The most transhumanist grades the Sixth World Companion's Transhumanism allows (p. 146) */
export const TRANSHUMAN_MAX = 20
export type CreationValue = number | boolean | string
/** from: the layer it comes from (runnerRules; unset: the server's); lockedBy: the campaign GM who locked it for its runners;
 *  assumed: a sample runner's, taken from its book's numbers (the book doesn't say). */
export interface CreationSetting {
  key: string
  value: CreationValue
  source?: string
  page?: number
  from?: RuleLayer
  lockedBy?: string
  assumed?: true
}
export type RuleLayer = 'server' | 'campaign' | 'runner'
export type CreationRules = Map<string, CreationSetting>
export type CreationType = 'number' | 'bool' | 'quality' | 'letters'
/** methods: the creation methods that need the setting set ('all': every one; []: optional). */
export interface CreationKey {
  key: string
  label: string
  type: CreationType
  group: string
  methods: Sr6Method[] | 'all'
}
