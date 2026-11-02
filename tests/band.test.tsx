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
  await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/src/register.tsx', old_string: 'a', new_string: 'b' })
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
const workingBand = { ...idleBand, isWorking: true }

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

test('compact and clear sit on the second row only, and clear asks first', async ($, on) => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  const ran: string[] = []
  on('clock.now', () => ({ value: now }))
  on('clock.every', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: now, context: { tokens: 50_000, window: 1_000_000, percent: 5 }, rateLimits: [] },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', (_, e) => {
    ran.push(e.command)
    return { text: '' }
  })
  // The confirmation is the app's question dialog (an AskUserQuestion call);
  // its answers, in order, null standing for closing the dialog.
  const answers: (string | null)[] = []
  const asked: { question: string; options: string[] }[] = []
  on('tool.call', (_, e) => {
    if (e.tool !== 'AskUserQuestion') return { result: {} }
    const q = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]!
    asked.push({ question: q.question, options: q.options.map(o => o.label) })
    const answer = answers.shift()
    if (answer === null || answer === undefined) throw new Error('dismissed')
    return { result: { questions: [q], answers: { [q.question]: answer } } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const empty = await $.ui.mount({ plugin: 'session-band', component: 'AbovePrompt', surface: 'desktop', props: idleBand })
  expect(await empty.find({ type: 'Button' })).toBeUndefined()
  await empty.unmount()

  await $.tool.call({ tool: 'Write', file_path: 'C:/proj/notes.md', content: 'x' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-band', component: 'AbovePrompt', surface, props: workingBand })
    answers.push('Keep it', null, 'Clear conversation')
    await ui.press({ key: 'compact' })
    await ui.press({ key: 'clear' })
    await ui.press({ key: 'clear' })
    await ui.press({ key: 'clear' })
    await ui.unmount()
  }
  // Each surface: compact at once; clear only on the third press, the one answered yes.
  expect(ran).toEqual(['compact', 'clear', 'compact', 'clear'])
  expect(asked).toHaveLength(6)
  expect(asked[0]).toEqual({
    question: 'Clear this conversation and start a new one?',
    options: ['Keep it', 'Clear conversation'],
  })
})

test('each side of the second line has a placeholder when it is empty', async ($, on) => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  on('clock.now', () => ({ value: now }))
  on('clock.every', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: now, context: { tokens: 50_000, window: 1_000_000, percent: 5 }, rateLimits: [] },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) =>
    e.tool === 'Artifact'
      ? { result: { url: 'https://claude.ai/code/artifact/abc', path: 'x', title: 'Report' } }
      : { result: {} },
  )
  const mount = (props: typeof idleBand) =>
    $.ui.mount({ plugin: 'session-band', component: 'AbovePrompt', surface: 'desktop', props })
  const text = async (ui: Awaited<ReturnType<typeof mount>>, words: RegExp) =>
    (await ui.find({ type: 'Text', text: words }))?.text

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // A file only read is not being edited: no second line.
  await $.tool.call({ tool: 'Read', file_path: 'C:/proj/readme.md' })
  let ui = await mount(workingBand)
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()

  // Editing with no artifacts: "No Artifacts" on the left.
  await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/app.ts', old_string: 'a', new_string: 'b' })
  ui = await mount(workingBand)
  expect(await text(ui, /^No Artifacts$/)).toBe('No Artifacts')
  expect(await text(ui, /No Active Files/)).toBeUndefined()
  await ui.unmount()

  // The turn over, nothing is being edited: no second line.
  ui = await mount(idleBand)
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()

  // An artifact and nothing being edited: "No Active Files" on the right.
  await $.tool.call({ tool: 'Artifact', file_path: 'C:/proj/report.html' })
  ui = await mount(idleBand)
  expect(await text(ui, /^No Active Files$/)).toBe('No Active Files')
  expect(await text(ui, /^No Artifacts$/)).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'clear' })).toBeDefined()
  await ui.unmount()
})

test('the newest usage reading from any session is drawn, and a reset window reads 0%', async ($, on) => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  const files = new Map<string, string>()
  // The engine hands fs hooks absolute paths in the platform's own spelling.
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  on('clock.now', () => ({ value: now }))
  on('clock.every', () => ({ value: undefined }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('fs.read', (_, e) => {
    const text = files.get(norm(e.path))
    if (text === undefined) throw new Error('missing')
    return { value: text }
  })
  on('fs.write', (_, e) => {
    files.set(norm(e.path), e.text)
    return { value: undefined }
  })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  // This session last heard 10% / 20%; another session has since heard more.
  on('session.usage', () => ({
    value: {
      startedAt: now,
      context: { tokens: 50_000, window: 1_000_000, percent: 5 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 10, resetsAt: '2026-11-01T14:00:00Z' },
        { kind: 'seven_day', percentUsed: 20, resetsAt: '2026-11-05T12:00:00Z' },
      ],
    },
  }))
  const path = '/home/me/.claude/session-band/usage.json'
  files.set(
    path,
    JSON.stringify({
      at: now - 60_000,
      rateLimits: [
        { kind: 'five_hour', percentUsed: 47, resetsAt: '2026-11-01T14:00:00Z' },
        { kind: 'seven_day', percentUsed: 33, resetsAt: '2026-11-05T12:00:00Z' },
      ],
    }),
  )

  const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  let ui = await $.ui.mount({ plugin: 'session-band', component: 'AbovePrompt', surface: 'desktop', props })
  expect((await ui.find({ type: 'Text', text: /^47%$/ }))?.text).toBe('47%')
  expect((await ui.find({ type: 'Text', text: /^33%$/ }))?.text).toBe('33%')
  expect(await ui.find({ type: 'Text', text: /^10%$/ })).toBeUndefined()
  await ui.unmount()

  // A newer reading this session hears is written for the others; an older one is not.
  await $.session.measure({
    context: { window: 1_000_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 50, resetsAt: '2026-11-01T14:00:00Z' }],
    changed: ['rateLimits'],
  })
  expect(JSON.parse(files.get(path) ?? '{}').at).toBe(now)

  // The five-hour window's reset has passed: it reads 0% with no countdown.
  files.set(
    path,
    JSON.stringify({
      at: now,
      rateLimits: [
        { kind: 'five_hour', percentUsed: 92, resetsAt: '2026-11-01T11:00:00Z' },
        { kind: 'seven_day', percentUsed: 33, resetsAt: '2026-11-05T12:00:00Z' },
      ],
    }),
  )
  ui = await $.ui.mount({ plugin: 'session-band', component: 'AbovePrompt', surface: 'desktop', props })
  expect((await ui.find({ type: 'Text', text: /^0%$/ }))?.text).toBe('0%')
  expect(await ui.find({ type: 'Text', text: /^92%$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /now/ })).toBeUndefined()
  await ui.unmount()
})
