// Riccardo, an Italian Piper neural voice that runs on the device (see js/tts-worker.js).
// The model and runtime (~32 MB over the wire) load on first use and are kept by the service worker.
const VOICE = new URL('../voices/it_IT-riccardo-x_low.onnx', import.meta.url).href;

const AC = window.AudioContext || window.webkitAudioContext;
export const piperSupported = !!(AC && window.Worker && window.WebAssembly);

let worker = null, ctx = null, source = null, seq = 0, nextId = 0;
let state = 'idle';             // idle | loading | ready | failed
const pending = new Map();
const cache = new Map();        // `${rate}|${text}` -> {samples, sampleRate}, most recent last

function call(msg) {
  if (!worker) {
    worker = new Worker(new URL('./tts-worker.js', import.meta.url));
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id); pending.delete(data.id);
      if (data.error) p?.reject(new Error(data.error)); else p?.resolve(data);
    };
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ id, voice: VOICE, ...msg }); });
}

// Start loading the voice. Resolves true once Riccardo can speak.
export function warmUp() {
  if (state === 'idle') {
    state = 'loading';
    call({}).then(() => { state = 'ready'; }, (e) => { state = 'failed'; console.warn('Piper voice unavailable:', e.message); });
  }
  return state;
}
export const piperReady = () => state === 'ready';

export async function synth(text, rate = 1) {
  const key = `${rate}|${text}`;
  let hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  hit = await call({ text, rate });
  cache.set(key, hit);
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return hit;
}

// iOS only lets Web Audio start inside a user gesture, so call this synchronously from the tap.
export function unlockAudio() {
  if (!piperSupported) return;
  // 'playback' keeps the voice audible when the ringer switch is on silent, like the system voices.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  ctx ||= new AC();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}

export function stopPiper() {
  seq++;
  try { source?.stop(); } catch {}
  source = null;
}

// Speaks with Riccardo. onend fires when the audio finishes, not when it's cut off by another call.
export async function speakPiper(text, { rate = 1, onend } = {}) {
  stopPiper();
  const mine = seq;
  unlockAudio();
  const { samples, sampleRate } = await synth(text, rate);
  if (mine !== seq) return;
  const buf = ctx.createBuffer(1, samples.length, sampleRate);
  buf.copyToChannel(samples, 0);
  source = ctx.createBufferSource();
  source.buffer = buf;
  source.connect(ctx.destination);
  source.onended = () => { if (mine === seq) { source = null; onend?.(); } };
  source.start();
}
