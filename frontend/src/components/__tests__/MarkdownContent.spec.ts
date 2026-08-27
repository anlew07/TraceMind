import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MarkdownContent from '@/components/MarkdownContent.vue'

describe('MarkdownContent', () => {
  it('renders basic Markdown used by saved knowledge', () => {
    const wrapper = mount(MarkdownContent, {
      props: {
        content: '**bold**\n\n- first\n- second\n\n```python\nprint("safe")\n```',
      },
    })

    expect(wrapper.get('strong').text()).toBe('bold')
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['first', 'second'])
    expect(wrapper.get('pre code').text()).toContain('print("safe")')
  })

  it('does not create raw HTML, unsafe links, or remote images', () => {
    const wrapper = mount(MarkdownContent, {
      props: {
        content:
          '<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n![remote](https://example.com/pixel.png)',
      },
    })

    expect(wrapper.find('script').exists()).toBe(false)
    const unsafeLink = wrapper.find('a')
    expect(unsafeLink.attributes('href')).not.toMatch(/^javascript:/i)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
  })

  it('renders only validated citations as accessible evidence controls', async () => {
    const wrapper = mount(MarkdownContent, {
      props: {
        content: '**Answer** [S1] [S999]',
        sourceIds: ['S1'],
        selectedSourceId: 'S1',
        citationControlsId: 'evidence-inspector',
      },
    })

    const citation = wrapper.get('button[data-citation-source-id="S1"]')
    expect(citation.attributes('aria-label')).toBe('查看证据 S1')
    expect(citation.attributes('aria-controls')).toBe('evidence-inspector')
    expect(citation.attributes('aria-pressed')).toBe('true')
    expect(wrapper.text()).toContain('[S999]')
    expect(wrapper.find('button[data-citation-source-id="S999"]').exists()).toBe(false)

    await citation.trigger('click')
    expect(wrapper.emitted('citation')).toEqual([['S1']])
  })
})
