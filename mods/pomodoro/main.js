// Pomodoro: a floating window with a glowing progress ring.
// Durations and rounds are set in the window's own settings view (the gear),
// stored in shared("pomodoro.config"); defaults: focus 25, short 5, long 15, every 4 rounds.
// Space starts/pauses, R resets, S skips, Esc closes (or leaves settings).
// Keys.json can bind "pomodoro.toggle", "pomodoro.reset" and "pomodoro.skip" while it is shown.
// Timer state lives in shared("pomodoro") as timestamps, so closing the window or
// reloading the mod never loses time.
import { View, div, PathBuilder, Background } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, shared, setShared, props, closeOverlay, notify, playSound, nextCommand, checking } from "herdr";

const MIN = 60 * 1000;
const PHASES = {
  focus: { label: "Focus", from: "#ff5f6d", to: "#ffc371", next: "Time for a break" },
  short: { label: "Short break", from: "#2fd69a", to: "#5ee7df", next: "Back to focus" },
  long: { label: "Long break", from: "#7f7fd5", to: "#86a8e7", next: "Back to focus" },
};
const QUOTES = {
  focus: ["One thing at a time.", "Deep work, shallow inbox.", "Ship the next small step.", "Stay with it."],
  short: ["Stand up, stretch.", "Look out of a window.", "Refill your water.", "Breathe."],
  long: ["Take a real walk.", "Step away from the screen.", "Make a tea.", "You earned this."],
};

// What the settings view edits: [key, label, unit, min, max, step].
const DEFAULTS = { focus: 25, short: 5, long: 15, rounds: 4 };
const FIELDS = [
  ["focus", "Focus", "min", 1, 120, 5],
  ["short", "Short break", "min", 1, 30, 1],
  ["long", "Long break", "min", 1, 60, 5],
  ["rounds", "Long break every", "rounds", 2, 8, 1],
];

const RING = 208;
const STROKE = 12;
const KEY = "pomodoro";
const CONFIG = "pomodoro.config";

// Local calendar day (toISOString would roll over at UTC midnight).
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

function config() {
  const c = shared(CONFIG);
  const out = { ...DEFAULTS };
  if (c && typeof c === "object") {
    for (const [k, , , lo, hi] of FIELDS) {
      const v = Number(c[k]);
      if (Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, Math.round(v)));
    }
  }
  return out;
}

const length = (phase, cfg = config()) => cfg[phase] * MIN;

function start(phase, s) {
  const total = length(phase);
  return { ...s, phase, running: false, remaining: total, total };
}

function fresh() {
  return start("focus", { round: 0, day: today(), done: 0, endsAt: 0 });
}

function load() {
  const s = shared(KEY);
  if (!s || typeof s !== "object" || !PHASES[s.phase]) return fresh();
  const total = s.total || length(s.phase);
  return s.day === today() ? { ...s, total } : { ...s, total, day: today(), done: 0 };
}

function left(s, now = Date.now()) {
  return s.running ? Math.max(0, s.endsAt - now) : s.remaining;
}

function clock(ms) {
  const t = Math.ceil(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// A clockwise arc from 12 o'clock covering `p` (0..1) of the circle.
function arc(p, c, r, width) {
  const b = PathBuilder.stroke(width);
  if (p >= 0.9995) {
    return b.move_to(c, c - r).arc_to(r, r, 0, false, true, c, c + r).arc_to(r, r, 0, false, true, c, c - r).build();
  }
  const a = 2 * Math.PI * p;
  return b.move_to(c, c - r).arc_to(r, r, 0, p > 0.5, true, c + r * Math.sin(a), c - r * Math.cos(a)).build();
}

const stop = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());

export default class Pomodoro extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.settings = false;
    if (checking()) return;
    cx.timer.every(1000, (cx) => {
      const s = load();
      if (!s.running) return;
      if (left(s) <= 0) this.finish(s);
      cx.notify();
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") this.handle.focus();
        else this.command(c);
        cx.notify();
      }
    });
  }

  save(s) {
    setShared(KEY, s);
  }

  command(c) {
    if (c === "toggle") this.toggle();
    else if (c === "reset") this.reset();
    else if (c === "skip") this.skip();
  }

  toggle() {
    const s = load();
    if (s.running) this.save({ ...s, running: false, remaining: left(s) });
    else this.save({ ...s, running: true, endsAt: Date.now() + s.remaining });
  }

  reset() {
    this.save(start(load().phase, load()));
  }

  select(phase) {
    this.save(start(phase, load()));
  }

  advance(s, counted) {
    let { round, done } = s;
    let phase;
    if (s.phase === "focus") {
      if (counted) { round += 1; done += 1; }
      phase = round >= config().rounds ? "long" : "short";
    } else {
      if (s.phase === "long") round = 0;
      phase = "focus";
    }
    return start(phase, { ...s, round, done });
  }

  skip() {
    this.save(this.advance(load(), false));
  }

  finish(s) {
    const was = PHASES[s.phase];
    const next = this.advance(s, true);
    this.save(next);
    playSound("done");
    notify({
      title: s.phase === "focus" ? `🍅 Focus round done (${next.done} today)` : `${was.label} is over`,
      body: `${was.next}: ${PHASES[next.phase].label.toLowerCase()}, ${config()[next.phase]} min. Press Start when ready.`,
      level: "success",
    });
  }

  // Changes one setting. An untouched (not started) phase picks up its new length at once;
  // a running or paused one keeps its own and the change applies from the next phase.
  // dir is +1 or -1; steps of 5 still reach 1 at the bottom (5 → 1 → 5).
  adjust(key, dir) {
    const [, , , lo, hi, step] = FIELDS.find((f) => f[0] === key);
    const cfg = config();
    const v = cfg[key];
    const next = dir > 0 ? (v < step ? step : v + step) : (v <= step ? lo : v - step);
    cfg[key] = Math.min(hi, Math.max(lo, next));
    setShared(CONFIG, cfg);
    const s = load();
    if (key === s.phase && !s.running && s.remaining === s.total) this.save(start(s.phase, s));
  }

  restore() {
    setShared(CONFIG, { ...DEFAULTS });
    const s = load();
    if (!s.running && s.remaining === s.total) this.save(start(s.phase, s));
  }

  close_window() {
    const id = props()?.overlay;
    if (id) closeOverlay(id);
  }

  ring(s, t, ph) {
    const ms = left(s);
    const p = Math.min(1, Math.max(0, ms / s.total));
    const c = RING / 2;
    const r = c - STROKE - 4;
    const layer = (el) => el.absolute().top(0).left(0).w(RING).h(RING);

    const a = 2 * Math.PI * p;
    const kx = c + r * Math.sin(a);
    const ky = c - r * Math.cos(a);
    const knob = STROKE + 6;

    const quote = QUOTES[s.phase][Math.floor(Date.now() / (10 * MIN)) % QUOTES[s.phase].length];

    return div().relative().w(RING).h(RING).flex_none()
      .child(layer(window.paint_path(arc(1, c, r, STROKE), t.border)))
      .when(p > 0.001, (el) => el
        .child(layer(window.paint_path(arc(p, c, r, STROKE + 10), Background.linear_gradient(135, ph.from, ph.to).opacity(0.18))))
        .child(layer(window.paint_path(arc(p, c, r, STROKE), Background.linear_gradient(135, ph.from, ph.to))))
        .child(div().absolute().left(kx - knob / 2).top(ky - knob / 2).w(knob).h(knob).rounded_full()
          .bg("#ffffff").border(3).border_color(ph.to)
          .when(s.running, (k) => k.loop("opacity", { from: 0.55, to: 1, period: 1600 }))))
      .child(layer(v_flex()).items_center().justify_center().gap(2)
        .child(div().text_size(46).font_weight(700).text_color(t.foreground).font_family("Geist Mono").child(clock(ms)))
        .child(div().text_size(11).text_color(t.muted).child(s.running ? quote : (ms === s.total ? "ready" : "paused"))));
  }

  chip(s, t, key) {
    const ph = PHASES[key];
    const on = s.phase === key;
    return stop(div().id(`chip-${key}`).px(10).py(4).rounded(999).text_size(11).font_weight(on ? 600 : 400)
      .bg(on ? ph.from + "26" : "#00000000").text_color(on ? ph.from : t.muted)
      .border(1).border_color(on ? ph.from + "66" : "#00000000")
      .hover((h) => h.bg(t.hover))
      .on_click((_e, cx) => { this.select(key); cx.notify(); })
      .child(ph.label));
  }

  button(id, label, t, onClick, opts = {}) {
    const size = opts.size ?? 36;
    const base = div().id(id).h(size);
    const el = (opts.wide ? base.px(26) : base.w(size)).flex().items_center().justify_center()
      .rounded(999).text_size(opts.wide ? 14 : 15).font_weight(600);
    const styled = opts.color
      ? el.bg(opts.color).text_color("#1b1b1f").shadow_md().hover((h) => h.opacity(0.9))
      : el.bg(t.raised).text_color(t.foreground).border(1).border_color(t.border).hover((h) => h.bg(t.hover));
    return stop(styled.when(!!opts.tip, (b) => b.tooltip(opts.tip)).on_click((_e, cx) => { onClick(); cx.notify(); }).child(label));
  }

  icon(id, label, tip, t, onClick) {
    return stop(div().id(id).w(22).h(22).rounded(999).flex().items_center().justify_center()
      .text_size(13).text_color(t.dim).hover((h) => h.bg(t.hover).text_color(t.foreground))
      .tooltip(tip).on_click((_e, cx) => { onClick(); cx.notify(); }).child(label));
  }

  header(t, title, dot, running) {
    return h_flex().w_full().items_center().justify_between()
      .child(h_flex().gap(8).items_center()
        .child(div().w(8).h(8).rounded_full().bg(dot)
          .when(running, (d) => d.loop("opacity", { from: 0.3, to: 1, period: 1400 })))
        .child(div().text_size(12).font_weight(600).text_color(t.muted).child(title)))
      .child(h_flex().gap(4)
        .child(this.icon("gear", this.settings ? "←" : "⚙", this.settings ? "Back" : "Settings", t, () => { this.settings = !this.settings; }))
        .child(this.icon("close", "✕", "Close (Esc)", t, () => this.close_window())));
  }

  settingsView(t, s) {
    const cfg = config();
    const row = ([key, label, unit]) => {
      const color = PHASES[key]?.from ?? t.accent;
      return h_flex().w_full().items_center().justify_between().py(6)
        .child(h_flex().gap(8).items_center()
          .child(div().w(8).h(8).rounded_full().bg(color))
          .child(div().text_size(13).text_color(t.foreground).child(label)))
        .child(h_flex().gap(8).items_center()
          .child(this.button(`dec-${key}`, "−", t, () => this.adjust(key, -1), { size: 26 }))
          .child(v_flex().w(44).items_center()
            .child(div().text_size(18).font_weight(700).font_family("Geist Mono").text_color(t.foreground).child(String(cfg[key])))
            .child(div().text_size(10).text_color(t.dim).child(unit)))
          .child(this.button(`inc-${key}`, "+", t, () => this.adjust(key, 1), { size: 26 })));
    };
    const busy = s.running || s.remaining !== s.total;
    return [
      v_flex().w_full().gap(2).p(12).rounded(14).bg(t.surface).border(1).border_color(t.border)
        .children(FIELDS.map(row)),
      div().text_size(11).text_color(t.dim).text_center()
        .child(busy ? "The current phase keeps its length; changes apply from the next one." : "Saved automatically."),
      h_flex().gap(10)
        .child(this.button("defaults", "Defaults", t, () => this.restore(), { wide: true }))
        .child(this.button("done", "Done", t, () => { this.settings = false; }, { wide: true, color: PHASES[s.phase].from })),
    ];
  }

  timerView(t, s, ph) {
    const rounds = config().rounds;
    const dots = Array.from({ length: rounds }, (_, i) =>
      div().w(8).h(8).rounded_full().bg(i < s.round ? PHASES.focus.from : t.border));
    const round = Math.min(s.round + (s.phase === "focus" ? 1 : 0), rounds) || 1;
    return [
      h_flex().gap(6).child(this.chip(s, t, "focus")).child(this.chip(s, t, "short")).child(this.chip(s, t, "long")),
      this.ring(s, t, ph),
      h_flex().gap(6).items_center().children(dots)
        .child(div().ml(4).text_size(11).text_color(t.dim).child(`round ${round} of ${rounds}`)),
      h_flex().gap(12).items_center()
        .child(this.button("reset", "↺", t, () => this.reset(), { tip: "Reset (R)" }))
        .child(this.button("toggle", s.running ? "Pause" : (s.remaining < s.total ? "Resume" : "Start"), t, () => this.toggle(), { wide: true, color: ph.from }))
        .child(this.button("skip", "⏭", t, () => this.skip(), { tip: "Skip (S)" })),
      div().text_size(11).text_color(t.dim).child(s.done ? `${"🍅".repeat(Math.min(s.done, 8))}${s.done > 8 ? ` ×${s.done}` : ""}  today` : "no tomatoes yet today"),
    ];
  }

  render() {
    const t = theme();
    const s = load();
    const ph = PHASES[s.phase];

    return v_flex().id("pomodoro").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") {
          if (!this.settings) return this.close_window();
          this.settings = false;
        } else if (this.settings) return;
        else if (e.key === "space") this.toggle();
        else if (e.key === "r") this.reset();
        else if (e.key === "s") this.skip();
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .on_mouse_down("left", () => this.handle.focus())
      .w(300).p(18).gap(14).items_center()
      .bg(t.popover).rounded(22).border(1).border_color(t.border).shadow_lg()
      .child(this.settings
        ? this.header(t, "SETTINGS", t.accent, false)
        : this.header(t, ph.label.toUpperCase(), s.running ? ph.from : t.dim, s.running))
      .children(this.settings ? this.settingsView(t, s) : this.timerView(t, s, ph));
  }
}
