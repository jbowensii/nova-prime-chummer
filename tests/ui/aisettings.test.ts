import { expect, test } from 'vitest'
import { parse, testBlocked, toXml } from '../../src/ui/AiSettings'

// Made up: an AnythingLLM server at anythingllm.test with a workspace slug "rules".
const SAVED = `<?xml version="1.0" encoding="UTF-8"?>
<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1" use="anythingllm">
  <provider id="anthropic" enabled="false"/>
  <provider id="openai" enabled="false"/>
  <provider id="gemini" enabled="false"/>
  <provider id="anythingllm" enabled="true" baseUrl="http://anythingllm.test:3001" model="left-over" workspace="rules"/>
  <key provider="anythingllm" set="true"/>
</ca2:aiproviders>
`

test('saved AnythingLLM settings, read back after a reload, leave Test enabled', () => {
  const s = parse(SAVED),
    p = s.providers.anythingllm
  expect(testBlocked('anythingllm', p, p, s.keys.anythingllm, false)).toBeNull()
  // what the page would save again, read back: same test fields, whatever it did with the stale model attribute
  const again = parse(toXml(s.use, s.providers)).providers.anythingllm
  expect(testBlocked('anythingllm', again, p, true, false)).toBeNull()
  // only the fields the test uses count, trimmed as saved; turning the provider off or on doesn't matter
  expect(testBlocked('anythingllm', { ...p, model: '', enabled: false, workspace: ' rules ' }, p, true, false)).toBeNull()
})

test('a disabled Test says why', () => {
  const p = parse(SAVED).providers.anythingllm
  expect(testBlocked('anythingllm', p, p, true, true)).toBe('Testing now:')
  expect(testBlocked('anythingllm', { ...p, workspace: 'lore' }, p, true, false)).toBe('Unsaved changes. Save settings first:')
  expect(testBlocked('anythingllm', p, p, false, false)).toBe('No key saved. Save a key first:')
  expect(testBlocked('openai', p, p, false, false)).toBeNull() // a local OpenAI-compatible server may need no key
})
