import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const mainCss = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')

describe('Conversation responsive CSS contract', () => {
  it('keeps the medium-width inspector out of normal document flow', () => {
    const mediumStart = mainCss.lastIndexOf('@media (max-width: 1120px)')
    const mobileStart = mainCss.indexOf('@media (max-width: 680px)', mediumStart)
    const mediumRule = mainCss.slice(mediumStart, mobileStart)

    expect(mediumRule).toContain('position: absolute')
    expect(mediumRule).toContain('inset: 0 0 0 auto')
    expect(mediumRule).not.toContain('grid-row')
  })

  it('uses an editorial right-rule query treatment without a filled chat bubble', () => {
    const queryStart = mainCss.lastIndexOf('.msg.user {')
    const queryEnd = mainCss.indexOf('}', queryStart)
    const queryRule = mainCss.slice(queryStart, queryEnd)

    expect(queryRule).toContain('width: min(70%, 580px)')
    expect(queryRule).toContain('border-right: 2px solid var(--color-accent)')
    expect(queryRule).toContain('background: transparent')
  })
})
