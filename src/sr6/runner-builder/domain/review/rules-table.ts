// Review rules, the table: the per-area rule lists joined in the order Review reports them.
import type { Rule } from './context'
import { RULES_METHOD_ATTRS } from './rules-method-attrs'
import { RULES_SKILLS_QUALITIES } from './rules-skills-qualities'
import { RULES_GEAR_MAGIC } from './rules-gear-magic'
import { RULES_CONTACTS_CATALOG } from './rules-contacts-catalog'

export const RULES: Rule[] = [...RULES_METHOD_ATTRS, ...RULES_SKILLS_QUALITIES, ...RULES_GEAR_MAGIC, ...RULES_CONTACTS_CATALOG]
