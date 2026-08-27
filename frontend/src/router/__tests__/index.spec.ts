import { createMemoryHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LANDING_SEEN_STORAGE_KEY } from '@/services/landingPreference'
import { createTraceMindRouter } from '@/router'

async function navigate(path: string) {
  const router = createTraceMindRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  return router.currentRoute.value
}

describe('entry routing', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('shows Landing when the root path has not been seen', async () => {
    const route = await navigate('/')

    expect(route.name).toBe('landing')
    expect(route.fullPath).toBe('/landing')
  })

  it('opens Workspace Home from the root path after Landing has been seen', async () => {
    window.localStorage.setItem(LANDING_SEEN_STORAGE_KEY, 'true')

    const route = await navigate('/')

    expect(route.name).toBe('knowledge-bases')
    expect(route.fullPath).toBe('/knowledge-bases')
  })

  it('keeps the explicit Landing route available after Landing has been seen', async () => {
    window.localStorage.setItem(LANDING_SEEN_STORAGE_KEY, 'true')

    const route = await navigate('/landing')

    expect(route.name).toBe('landing')
    expect(route.fullPath).toBe('/landing')
  })

  it.each([
    ['/knowledge-bases/kb-id/chat', 'conversation'],
    ['/knowledge-bases/kb-id/documents', 'documents'],
    ['/knowledge-bases/kb-id/knowledge', 'knowledge'],
    ['/knowledge-bases/kb-id/map', 'knowledge-map'],
    ['/knowledge-bases/kb-id/retrieval', 'retrieval'],
    ['/knowledge-bases/kb-id/data-management', 'data-management'],
  ])('does not intercept the deep link %s', async (path, routeName) => {
    const storageRead = vi.spyOn(Storage.prototype, 'getItem')

    const route = await navigate(path)

    expect(route.fullPath).toBe(path)
    expect(route.name).toBe(routeName)
    expect(storageRead).not.toHaveBeenCalled()
  })

  it('keeps Retrieval outside the four primary knowledge-base destinations', () => {
    const routes = createTraceMindRouter(createMemoryHistory()).getRoutes()
    expect(routes.find((route) => route.name === 'retrieval')?.path).toBe(
      '/knowledge-bases/:knowledgeBaseId/retrieval',
    )
  })

  it('keeps Data Management as a secondary knowledge-base capability', () => {
    const routes = createTraceMindRouter(createMemoryHistory()).getRoutes()
    expect(routes.find((route) => route.name === 'data-management')?.path).toBe(
      '/knowledge-bases/:knowledgeBaseId/data-management',
    )
  })

  it('falls back to Landing when localStorage cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })

    const route = await navigate('/')

    expect(route.name).toBe('landing')
  })
})
