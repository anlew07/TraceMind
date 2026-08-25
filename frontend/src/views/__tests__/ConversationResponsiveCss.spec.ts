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

  it('uses asymmetric user and answer surfaces without visible shadows', () => {
    const messageStart = mainCss.lastIndexOf('.msg {', mainCss.indexOf('.msg.user {'))
    const queryStart = mainCss.indexOf('.msg.user {', messageStart)
    const queryEnd = mainCss.indexOf('}', queryStart)
    const queryRule = mainCss.slice(queryStart, queryEnd)
    const answerStart = mainCss.indexOf('.msg.assistant {', queryEnd)
    const answerEnd = mainCss.indexOf('}', answerStart)
    const answerRule = mainCss.slice(answerStart, answerEnd)

    expect(queryRule).toContain('max-width: min(70%, 620px)')
    expect(queryRule).toContain('background: var(--color-accent-soft)')
    expect(queryRule).toContain('border-radius: var(--radius-message)')
    expect(queryRule).not.toContain('box-shadow')
    expect(answerRule).toContain('background: var(--color-surface)')
    expect(answerRule).toContain('border: 1px solid var(--color-border-light)')
    expect(answerRule).not.toContain('box-shadow')
  })
})
