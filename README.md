# DashBand

A Claude Code mod that adds a slim band right above the prompt box, styled to blend in with the Claude desktop app.

**First line, always visible:**

- **Session**: how much of your 5-hour usage window you've used, with a countdown to when it resets.
- **Weekly**: how much of your weekly usage window you've used, with its own countdown.
- **Context**: how full the current conversation's context window is, with tokens used out of the model's maximum.

Every figure comes from Claude Code's live readings, so the bars stay accurate if usage limits or context sizes change.

**Second line, only when there's something to show:**

- Links to every artifact Claude has published in the session, on the left.
- The names of the files Claude is reading or editing, on the right. They shimmer while Claude is working.
- Two icon buttons at the far right: **⊟** runs `/compact` and **🗑** runs `/clear`. The clear button wipes the conversation right away, with no confirmation.

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
