import { expect, test } from 'claude-code/testing'

const band = (isWorking: boolean) =>
  ({
    plugin: 'session-band',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking,
      maxRows: 10,
      bodyColumns: 120,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  }) as const

test('the band shows usage, artifacts and files on every surface', async ($, on) => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  on('clock.now', () => ({ value: now }))
  on('clock.every', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: {
      startedAt: now,
      context: { tokens: 61_000, window: 200_000, percent: 31 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-11-01T14:13:00Z' },
        { kind: 'seven_day', percentUsed: 18.5, resetsAt: '2026-11-04T16:00:00Z' },
      ],
    },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) =>
    e.tool === 'Artifact'
      ? { result: { url: 'https://claude.ai/code/artifact/abc', path: 'x', title: 'Usage Report' } }
      : { result: {} },
  )

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: 'C:/proj/src/register.tsx' })
  await $.tool.call({ tool: 'Artifact', file_path: 'C:/proj/report.html' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(true), surface })
    expect((await ui.find({ type: 'Text', text: /^42%$/ }))?.text).toBe('42%')
    expect((await ui.find({ type: 'Text', text: /2h 13m/ }))?.text).toBe('↻ 2h 13m')
    expect((await ui.find({ type: 'Text', text: /3d 4h/ }))?.text).toBe('↻ 3d 4h')
    expect((await ui.find({ type: 'Text', text: /61k\/200k/ }))?.text).toBe('61k/200k')
    await ui.unmount()
  }
})

test('renamed or new usage windows still land in the right bars', async ($, on) => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  on('clock.now', () => ({ value: now }))
  on('clock.every', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: {
      startedAt: now,
      context: { tokens: 1_500_000, window: 2_000_000, percent: 75 },
      rateLimits: [
        { kind: 'weekly_all_models', percentUsed: 64, resetsAt: '2026-11-03T12:00:00Z' },
        { kind: 'rolling_session', percentUsed: 12, resetsAt: '2026-11-01T13:30:00Z' },
      ],
    },
  }))

  const ui = await $.ui.mount({
    plugin: 'session-band',
    component: 'AbovePrompt',
    surface: 'desktop',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  expect((await ui.find({ type: 'Text', text: /^12%$/ }))?.text).toBe('12%')
  expect((await ui.find({ type: 'Text', text: /1h 30m/ }))?.text).toBe('↻ 1h 30m')
  expect((await ui.find({ type: 'Text', text: /^64%$/ }))?.text).toBe('64%')
  expect((await ui.find({ type: 'Text', text: /2d 0h/ }))?.text).toBe('↻ 2d 0h')
  expect((await ui.find({ type: 'Text', text: /1\.5M\/2\.0M/ }))?.text).toBe('1.5M/2.0M')
  await ui.unmount()
})

const idleBand = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }

test('the bars keep round caps with room for them at both ends', async ($, on) => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  on('clock.now', () => ({ value: now }))
  on('session.usage', () => ({
    value: { startedAt: now, context: { tokens: 50_000, window: 1_000_000, percent: 5 }, rateLimits: [] },
  }))

  const ui = await $.ui.mount({ plugin: 'session-band', component: 'AbovePrompt', surface: 'desktop', props: idleBand })
  const bar = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(bar).toContain('stroke-linecap="round"')
  expect(bar).toContain('vector-effect="non-scaling-stroke"')
  // Each end at least 5 of the 100 units in from the edge, past the cap's 3.
  for (const [, x] of bar.matchAll(/x[12]="([\d.]+)"/g)) {
    expect(Number(x)).toBeGreaterThanOrEqual(5)
    expect(Number(x)).toBeLessThanOrEqual(95)
  }
  await ui.unmount()
})

test('compact and clear sit on the second row only, and run their commands', async ($, on) => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  const ran: string[] = []
  on('clock.now', () => ({ value: now }))
  on('clock.every', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: now, context: { tokens: 50_000, window: 1_000_000, percent: 5 }, rateLimits: [] },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('command.run', (_, e) => {
    ran.push(e.command)
    return { text: '' }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const empty = await $.ui.mount({ plugin: 'session-band', component: 'AbovePrompt', surface: 'desktop', props: idleBand })
  expect(await empty.find({ type: 'Button' })).toBeUndefined()
  await empty.unmount()

  await $.tool.call({ tool: 'Read', file_path: 'C:/proj/notes.md' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-band', component: 'AbovePrompt', surface, props: idleBand })
    await ui.press({ key: 'compact' })
    await ui.press({ key: 'clear' })
    await ui.unmount()
  }
  expect(ran).toEqual(['compact', 'clear', 'compact', 'clear'])
})
