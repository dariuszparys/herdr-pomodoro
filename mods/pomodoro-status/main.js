// Pomodoro status: a 🍅 for the status bar that shows the Pomodoro mod's time left
// and opens or closes its window when clicked. Reads shared("pomodoro"), written by
// mods/pomodoro. Meant for a narrow block beside the status bar (see README.md);
// it paints the status bar's look (chrome background, top border) so the two read as one bar.
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, shared, run, checking } from "herdr";

const PHASES = { focus: ["Focus", "#ff5f6d"], short: ["Break", "#2fd69a"], long: ["Long break", "#7f7fd5"] };

function state() {
  const s = shared("pomodoro");
  if (!s || typeof s !== "object" || !PHASES[s.phase]) return null;
  const ms = s.running ? Math.max(0, s.endsAt - Date.now()) : s.remaining;
  const t = Math.ceil(ms / 1000);
  const clock = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  return { ...s, ms, clock, idle: !s.running && ms === s.total };
}

export default class PomodoroStatus extends View {
  // Ticks only while a pomodoro runs; shared-state changes redraw on their own.
  init(_props, cx) {
    if (checking()) return;
    cx.timer.every(1000, (cx) => { if (shared("pomodoro")?.running) cx.notify(); });
  }

  render() {
    const t = theme();
    const p = state();
    const [label, color] = PHASES[p?.phase ?? "focus"];
    const text = !p || p.idle ? null
      : p.running && p.ms === 0 ? "time's up"
      : p.running ? `${label} ${p.clock}`
      : `${label} ${p.clock} · paused`;

    return h_flex().size_full().pr(14).items_center().justify_end()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(h_flex().id("pomodoro").flex_none().gap(6).items_center().px(6).h(20).rounded(6)
        .hover((h) => h.bg(t.hover).text_color(t.foreground))
        .tooltip("Pomodoro")
        .on_click(() => run("mod.open", { name: "pomodoro" }))
        .child("🍅")
        .when(Boolean(text), (el) => el
          .when(Boolean(p?.running), (r) => r.child(div().size(6).rounded(3).bg(color).loop("opacity", { from: 0.3, to: 1, period: 1400 })))
          .child(div().flex_none().whitespace_nowrap().text_color(p.running ? t.foreground : t.muted).font_family("Geist Mono").child(text))));
  }
}
