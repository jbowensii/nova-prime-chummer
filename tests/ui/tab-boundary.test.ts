// A tab that throws while drawing shows a way back instead of a blank page (src/shared/ui.tsx TabBoundary).
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'
import { TabBoundary } from '../../src/shared/ui'

test('a tab that throws: a message and a reload button, the page still there', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  const Broken = () => {
    throw new Error('made-up failure')
  }
  const el = document.createElement('div'),
    root = createRoot(el)
  await act(async () => root.render(createElement(TabBoundary, null, createElement(Broken))))
  expect(el.querySelector('[role=alert]')?.textContent).toContain('This tab hit an error — your saved changes are safe.')
  expect(el.querySelector('button')?.textContent).toBe('Reload')
  root.unmount()
  quiet.mockRestore()
})
