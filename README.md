# Pomodoro for Herdr

A floating Pomodoro timer mod for the [Herdr app](https://herdr.dev). A
countdown sits inside a gradient progress ring. It cycles through focus
rounds, short breaks and long breaks, and tells you with a sound and a
notification when each phase ends.

![Pomodoro](preview.png)

## Features

- A focus/short break/long break cycle, with a long break after every 4 focus
  rounds.
- A progress ring that empties clockwise, with a different colour for each phase.
- In-window settings for each phase's length and how many rounds come before
  a long break.
- A daily 🍅 count of finished focus rounds.
- A window you can drag anywhere. It remembers its position and comes back
  after a restart.
- Time keeps counting when the window is closed, and it survives a Herdr
  restart.

The mod doesn't use the network, doesn't run programs and only reads Herdr's
own shared state.

## Install

You need the Herdr app. The mod was built and checked with `herdr-app` 0.1.16.

**With an agent:** ask the coding agent you use in Herdr to add
`https://github.com/dariuszparys/herdr-pomodoro`. Herdr's `AGENTS.md` tells it
how to install shared mods.

**By hand:**

1. Clone the repository and copy the mod into your Herdr folder:

   ```sh
   git clone https://github.com/dariuszparys/herdr-pomodoro
   cp -R herdr-pomodoro/mods/pomodoro ~/.config/herdr-app/mods/
   ```

   If you already have a mod named `pomodoro`, copy this one under another
   name instead.

2. Add the shortcut to the `"global"` section of
   `~/.config/herdr-app/keys.json`:

   ```json
   "cmd-alt-p": "mod.open:pomodoro"
   ```

   Pick another key if you already use ⌘⌥P.

3. Check the mod, then open it:

   ```sh
   herdr-app check ~/.config/herdr-app/mods/pomodoro
   herdr-app do mod.open --name pomodoro
   ```

## Use

Press **⌘⌥P** to open or close the window. Herdr's command palette can't list
mods, so use the shortcut or `herdr-app do mod.open --name pomodoro`.

| Control | Key | What it does |
|---|---|---|
| Start / Pause / Resume | Space | Runs or pauses the current phase |
| ↺ | R | Resets the current phase to its full length |
| ⏭ | S | Skips to the next phase without counting a round |
| ✕ | Esc | Closes the window; the timer keeps running |
| Focus / Short break / Long break | | Switches to that phase, stopped |
| ⚙ | | Opens the settings |

Click the window first so the keys reach it.

When a phase ends, the next one is ready, but it doesn't start until you press
Start. If the window is closed when a phase ends, the sound and notification
come when you next open it.

## Settings

Click ⚙ in the window. Changes save straight away and stay after a restart.

| Setting | Default | Range |
|---|---|---|
| Focus | 25 min | 1–120 |
| Short break | 5 min | 1–30 |
| Long break | 15 min | 1–60 |
| Long break every | 4 rounds | 2–8 |

A phase that is running or paused keeps its length. Your change applies from
the next phase.

## Uninstall

Delete `~/.config/herdr-app/mods/pomodoro` and remove the `cmd-alt-p` line
from `keys.json`.

## Build it yourself

[RECIPE.md](RECIPE.md) describes the mod in enough detail for an agent to
rebuild it from scratch, which is how mods are shared on herdr.dev.

## License

[MIT](LICENSE)
