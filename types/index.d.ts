export type ArtifactLink = { url: string; title: string }

declare module 'claude-code' {
  interface PluginState {
    'session-band': { artifacts: ArtifactLink[]; files: string[] }
  }
}
