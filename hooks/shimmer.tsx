import type { ClientModule } from 'claude-code'

type Props = { names: string[]; active: boolean }
type Live = { active: boolean }
type State = { tick: number; live: Live }

const SWEEP = 3
const PAD = 6

// A highlight sweeps left to right across each name while Claude works;
// at rest the names sit dim and still.
const Shimmer: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    const live: Live = { active: props.active }
    let tick = 0
    surface.every(70, () => {
      if (!live.active) return
      tick += 1
      surface.setState({ tick, live })
    })
    surface.setState({ tick, live })
  } else {
    surface.state.live.active = props.active
  }

  const tick = surface.state?.tick ?? 0

  return (
    <Box flexDirection="row" alignItems="center" gap="sm">
      {props.names.map((name, i) => {
        if (!props.active) {
          return (
            <Text key={name} size="caption" mono dimColor>
              {name}
            </Text>
          )
        }
        const span = name.length + PAD * 2
        const at = ((tick + i * 7) % span) - PAD
        const start = Math.max(0, Math.min(name.length, at))
        const end = Math.max(0, Math.min(name.length, at + SWEEP))
        return (
          <Text key={name} size="caption" mono>
            <Text dimColor>{name.slice(0, start)}</Text>
            <Text color="text" weight="medium">
              {name.slice(start, end)}
            </Text>
            <Text dimColor>{name.slice(end)}</Text>
          </Text>
        )
      })}
    </Box>
  )
}

export default Shimmer
