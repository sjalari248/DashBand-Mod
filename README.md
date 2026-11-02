# DashBand

A Claude Code mod that adds a slim band right above the prompt box, styled to blend in with the Claude desktop app.

**First line, always visible:**

- **Session**: how much of your 5-hour usage window you've used, with a countdown to when it resets.
- **Weekly**: how much of your weekly usage window you've used, with its own countdown.
- **Context**: how full the current conversation's context window is, with tokens used out of the model's maximum.

Every figure comes from Claude Code's live readings, so the bars stay accurate if usage limits or context sizes change.

Session and Weekly usage is shared between your sessions: whichever session last heard back from Claude saves its reading, and every open session shows the newest one within about 30 seconds, without you sending a message. When a usage window resets, its bar drops to 0% straight away. The reading is kept in `~/.claude/session-band/usage.json`.

**Second line, only when Claude has published an artifact in the session or is editing files right now:**

- Links to every artifact Claude has published in the session, on the left, or "No Artifacts" if there are none yet.
- The names of the files Claude is editing during the current turn, shimmering, on the right, or "No Active Files" when nothing is being edited.
- Two icon buttons at the far right: **⊟** runs `/compact` and **🗑** runs `/clear`. The clear button wipes the conversation right away, with no confirmation.

<img width="1396" height="264" alt="image" src="https://github.com/user-attachments/assets/25658535-4e1c-4c77-953d-775e5fa95c75" />

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install session-band --marketplace sjalari248/DashBand-Mod
```

From a shell:

```
claude plugin install session-band --marketplace sjalari248/DashBand-Mod
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `sjalari248/DashBand-Mod`, then **Add plugin**.

Answer `y` to add the marketplace, then pick the user scope so the band shows up in every session.

## Notes

- Works on Windows, macOS and Linux.
- The full look (colored bars, shimmer) is drawn in the Claude desktop app's Code tab. In a terminal session the band shows text figures instead of bars.
- The Session and Weekly bars only fill in on a Claude subscription, and only after Claude's first reply in a session.
