import { describe, expect, it } from 'vitest'

import router from '@/router'

describe('router entry flow', () => {
  it('uses workspace as home and keeps landing explicit', () => {
    expect(router.resolve('/').name).toBe('home')
    expect(router.resolve('/landing').name).toBe('landing')
    expect(router.resolve('/knowledge-bases').name).toBe('knowledge-bases')
  })

  it('keeps direct knowledge-base routes stable', () => {
    expect(router.resolve('/knowledge-bases/kb-1/chat').name).toBe('conversation')
    expect(router.resolve('/knowledge-bases/kb-1/documents').name).toBe('documents')
    expect(router.resolve('/knowledge-bases/kb-1/retrieval').name).toBe('retrieval')
    expect(router.resolve('/knowledge-bases/kb-1/data-management').name).toBe('data-management')
    expect(router.resolve('/knowledge-bases/kb-1/knowledge').name).toBe('knowledge')
    expect(router.resolve('/knowledge-bases/kb-1/map').name).toBe('knowledge-map')
  })

  it('keeps Retrieval outside the four primary knowledge-base destinations', () => {
    const routes = router.getRoutes()
    expect(routes.find((route) => route.name === 'retrieval')?.path).toBe(
      '/knowledge-bases/:knowledgeBaseId/retrieval',
    )
  })

  it('keeps Data Management as a secondary knowledge-base capability', () => {
    const routes = router.getRoutes()
    expect(routes.find((route) => route.name === 'data-management')?.path).toBe(
      '/knowledge-bases/:knowledgeBaseId/data-management',
    )
  })
})
