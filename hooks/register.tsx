import { atom, read, update } from 'claude-code'
import type { ElementTable, Register, SessionRateLimit } from 'claude-code'

import type { ArtifactLink } from '../types'

const artifacts = atom({ plugin: 'session-band', key: 'artifacts' } as const, [])
const files = atom({ plugin: 'session-band', key: 'files' } as const, [])

const SESSION_FILL = '#67b6c9'
const WEEKLY_FILL = '#c967a0'
const CONTEXT_FILL = '#c98e67'

const BAR_HEIGHT = 6
// How far the bar's ends sit in from its slot's edges, in hundredths of the
// slot's width. The round caps reach BAR_HEIGHT / 2 past each end; 5% keeps
// them whole in any slot 60px or wider, and, should a surface scale the
// strokes with the drawing, at any width at all (3 of 100 units < 5).
const BAR_INSET = 5
// The widest the meters run, in cells; past it the band pads both sides equally.
const MAX_COLUMNS = 150
const MAX_FILES = 3
// The tools that change a file: only files Claude is editing are shown.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

const clipMiddle = (text: string, max: number) => {
  if (text.length <= max) return text
  const keep = max - 1
  return `${text.slice(0, Math.ceil(keep / 2))}…${text.slice(text.length - Math.floor(keep / 2))}`
}

// A rounded track in the fill's own tint with the fill over it, drawn as two
// round-capped strokes. The drawing stretches to whatever width its slot has;
// the strokes do not scale, so they keep their thickness and their caps.
const barSvg = (percent: number | undefined, fill: string) => {
  const used = Math.max(0, Math.min(100, percent ?? 0))
  const span = 100 - BAR_INSET * 2
  const end = BAR_INSET + (used / 100) * span
  const line = (to: number, opacity: number) =>
    `<line x1="${BAR_INSET}" y1="${BAR_HEIGHT / 2}" x2="${to.toFixed(2)}" y2="${BAR_HEIGHT / 2}" ` +
    `stroke="${fill}" stroke-opacity="${opacity}" stroke-width="${BAR_HEIGHT}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${BAR_HEIGHT}" viewBox="0 0 100 ${BAR_HEIGHT}" preserveAspectRatio="none">` +
    line(100 - BAR_INSET, 0.22) +
    (used > 0 ? line(end, 1) : '') +
    `</svg>`
  )
}

const countdown = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return undefined
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms)) return undefined
  if (ms <= 0) return 'now'
  const minutes = Math.ceil(ms / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

// Every figure here is the engine's live reading: percentages are measured by
// the API against whatever the limits are today, and the context window is the
// current model's. Windows are picked by what they are rather than one fixed
// name, so a renamed or added window still lands in the right bar.
const pickWindows = (limits: readonly SessionRateLimit[], now: number) => {
  const timed = limits.filter(l => l.kind !== 'spend_limit')
  const horizon = (l: SessionRateLimit) => (l.resetsAt ? Date.parse(l.resetsAt) - now : Number.POSITIVE_INFINITY)
  const fullest = (list: SessionRateLimit[]) => list.reduce<SessionRateLimit | undefined>(
    (top, l) => (top === undefined || l.percentUsed > top.percentUsed ? l : top),
    undefined,
  )
  const byHorizon = [...timed].sort((a, b) => horizon(a) - horizon(b))

  const session =
    timed.find(l => l.kind === 'five_hour') ?? fullest(timed.filter(l => /hour|session/i.test(l.kind))) ?? byHorizon[0]
  const weekly =
    timed.find(l => l.kind === 'seven_day') ??
    fullest(timed.filter(l => /day|week/i.test(l.kind))) ??
    byHorizon.filter(l => l !== session).at(-1)

  return { session, weekly }
}

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`)

const pct = (n: number | undefined) => (n === undefined ? '—' : `${Math.round(n)}%`)

export const register: Register = on => {
  on('session.start', ($, e, next) => {
    // The countdowns tick by the minute; a measure redraws sooner.
    $.clock.every(30_000, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('session.measure', ($, e, next) => {
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, files, () => [])
    return next(e)
  }).catch(($, e, next) => next(e))

  // The main conversation's turn ending ends the editing; a subagent's does not.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      await update($, files, () => [])
    }
    $.ui.invalidate('ui.render')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const args = e as unknown as Record<string, unknown>

    if (EDIT_TOOLS.has(e.tool)) {
      const path = args.file_path ?? args.notebook_path
      if (typeof path === 'string' && path) {
        const name = basename(path)
        await update($, files, list => [name, ...list.filter(f => f !== name)].slice(0, MAX_FILES))
      }
    }

    const r = await next(e)

    if (e.tool === 'Artifact' && 'result' in r && !('isError' in r && r.isError)) {
      const action = args.action
      const isPublish = (action === undefined || action === 'publish') && !args.asset
      const result = r.result as Record<string, unknown> | undefined
      const url = result?.url
      if (isPublish && typeof url === 'string' && !('opened' in (result ?? {}))) {
        const filePath = typeof args.file_path === 'string' ? args.file_path : undefined
        const title =
          (typeof result?.title === 'string' && result.title) ||
          (typeof args.title === 'string' && args.title) ||
          (filePath ? basename(filePath).replace(/\.[^.]+$/, '') : 'Artifact')
        const link: ArtifactLink = { url, title }
        await update($, artifacts, list => [...list.filter(a => a.url !== url), link])
      }
    }

    return r
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    const { Svg, Link, Client } = $.ui.resolve(e) as Partial<ElementTable<'desktop'>>

    const [usage, now, made, touched] = await Promise.all([
      $.session.usage(),
      $.clock.now(),
      read($, artifacts),
      read($, files),
    ])

    const { session, weekly } = pickWindows(usage.rateLimits, now)
    const ctx = usage.context
    // The engine's figure where it gave one, else the same ratio from its counts.
    const ctxPercent =
      ctx.percent ?? (ctx.tokens !== undefined && ctx.window > 0 ? (ctx.tokens / ctx.window) * 100 : undefined)

    // Each meter takes an equal share of the row; its bar fills what the
    // label and figures leave, so the bars are as long as the band allows and
    // never push the row past it. The gaps between meters stay fixed.
    const meter = (
      key: string,
      label: string,
      percent: number | undefined,
      fill: string,
      detail: string | undefined,
    ) => (
      <Box key={key} flexDirection="row" flexGrow={1} flexShrink={1} width={0} alignItems="center" gap="xs">
        <Text size="caption" dimColor>
          {label}
        </Text>
        <Box flexGrow={1} flexShrink={1} width={0} minWidth={0} overflow="hidden">
          {Svg ? <Svg source={barSvg(percent, fill)} alt={`${label} ${pct(percent)} used`} height={BAR_HEIGHT} /> : null}
        </Box>
        <Text size="caption" tabular>
          {pct(percent)}
        </Text>
        {detail ? (
          <Text size="caption" tabular dimColor wrap="truncate-end">
            {detail}
          </Text>
        ) : null}
      </Box>
    )

    const sessionReset = countdown(session?.resetsAt, now)
    const weeklyReset = countdown(weekly?.resetsAt, now)
    const ctxDetail = ctx.tokens !== undefined ? `${tokens(ctx.tokens)}/${tokens(ctx.window)}` : undefined

    // Files count only while a turn is editing them; the second line shows
    // only when there are artifacts or such files, with a placeholder on
    // whichever side has nothing.
    const editing = e.props.isWorking ? touched : []
    const hasExtras = made.length > 0 || editing.length > 0
    const names = editing.map(n => clipMiddle(n, 32))

    // Both run the engine's own command, as typing it would: /compact queues
    // until the session is idle, /clear starts the conversation over.
    const run = (command: 'compact' | 'clear') => () => {
      $.command.run({ command }).catch(() => $.ui.toast(`Could not run /${command}`))
    }

    // The band's own frame leaves a margin each side; xs adds half as much
    // again, so "Session" and the context figure sit 50% further from its
    // edges. On a very wide band the meters stop at MAX_COLUMNS, centred.
    const sidePad = Math.max(0, Math.floor((e.props.bodyColumns - MAX_COLUMNS) / 2))

    // The meters on one line; beneath them, only when there is something to
    // show, a row of the same width: artifacts from the left edge of "Session",
    // then the files and the compact and clear icons, the last of them ending
    // at the right edge of the context figure.
    return (
      <Box flexDirection="column" rowGap="xs" paddingX={sidePad > 0 ? sidePad : 'xs'}>
        <Box flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap="lg">
          {meter('session', 'Session', session?.percentUsed, SESSION_FILL, sessionReset && `↻ ${sessionReset}`)}
          {meter('weekly', 'Weekly', weekly?.percentUsed, WEEKLY_FILL, weeklyReset && `↻ ${weeklyReset}`)}
          {meter('context', 'Context', ctxPercent, CONTEXT_FILL, ctxDetail)}
        </Box>

        {hasExtras ? (
          <Box flexDirection="row" alignItems="center" columnGap="lg" overflow="hidden">
            <Box flexShrink={1} minWidth={0} flexDirection="row" alignItems="center" gap="xs" overflow="hidden">
              <Text size="caption" dimColor>
                {made.length > 0 ? 'Artifacts' : 'No Artifacts'}
              </Text>
              {made.map(a =>
                Link ? (
                  <Link key={a.url} href={a.url} label={`◆ ${clip(a.title, 22)}`} />
                ) : (
                  <Text key={a.url} size="caption">
                    ◆ {clip(a.title, 22)}
                  </Text>
                ),
              )}
            </Box>

            <Box flexGrow={1} />

            <Box flexShrink={1} minWidth={0} flexDirection="row" justifyContent="flex-end" alignItems="center" overflow="hidden">
              {names.length > 0 ? (
                Client ? (
                  <Client key="files" module="./shimmer.tsx" props={{ names, active: true }} />
                ) : (
                  <Text size="caption" dimColor wrap="truncate-start">
                    {names.join('  ')}
                  </Text>
                )
              ) : (
                <Text size="caption" dimColor>
                  No Active Files
                </Text>
              )}
            </Box>

            <Box flexShrink={0} flexDirection="row" alignItems="center" gap="xs">
              <Button key="compact" label="⊟" plain dimColor onPress={run('compact')} />
              <Button key="clear" label={'\u{1F5D1}\u{FE0E}'} plain dimColor onPress={run('clear')} />
            </Box>
          </Box>
        ) : null}
      </Box>
    )
  })
}
