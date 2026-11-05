// A short beep when a code is read, like a shop scanner: high and short when
// it is good, low and double when it is not (unknown code, already added…).
// Made with the Web Audio API, so there is no sound file to load.

let ctx: AudioContext | null = null;

/** Prepares the sound (call it from a click so the browser allows audio). */
export function primeBeep() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function beep(ok = true) {
  primeBeep();
  if (!ctx) return;
  const tones = ok ? [{ f: 1800, at: 0, len: 0.09 }] : [{ f: 300, at: 0, len: 0.12 }, { f: 300, at: 0.18, len: 0.12 }];
  const now = ctx.currentTime;
  for (const t of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = t.f;
    // Short fade in / out so it doesn't click.
    gain.gain.setValueAtTime(0.0001, now + t.at);
    gain.gain.exponentialRampToValueAtTime(0.25, now + t.at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t.at + t.len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + t.at);
    osc.stop(now + t.at + t.len + 0.02);
  }
}
