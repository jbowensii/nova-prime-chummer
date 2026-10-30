// An implant's add-on takes its grade (CRB p. 282); a device put in it (a commlink in a cyber-commlink) does not.
import { expect, test } from 'vitest'
import { fitted } from '../../../src/sr6/runner-builder/domain/creation/purchases'
import type { Sr6Purchase } from '../../../src/sr6/formats/domain/character'

const p = (kind: Sr6Purchase['kind'], grade?: string) =>
  ({ uid: kind, kind, id: `zz.${kind}`, qty: 1, accessories: [], ...(grade ? { grade } : {}) }) as Sr6Purchase

test('an implant add-on has its implant’s grade; an electronics device in it keeps its own', () => {
  const host = p('augmentations', 'alpha')
  expect(fitted(host, p('augmentations')).grade).toBe('alpha')
  expect(fitted(host, p('electronics')).grade).toBeUndefined()
})
