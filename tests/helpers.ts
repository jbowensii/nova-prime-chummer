import { readFileSync, readdirSync } from 'node:fs'
import { buildCatalog, type SourceFile } from '../src/engine/load'
import type { Character } from '../src/model/types'

export const base: SourceFile[] = readdirSync('public/data').filter(f => f.endsWith('.xml'))
  .map(f => ({ file: f, xml: readFileSync(`public/data/${f}`, 'utf8'), overlay: false }))
export const cat = buildCatalog(base)
export const sample = (name: string): Character => JSON.parse(readFileSync(`public/samples/${name}.ca2.json`, 'utf8'))
