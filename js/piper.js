// Italian Piper neural voices that run on the device (see js/tts-worker.js). A voice's model,
// plus the shared runtime (~4 MB over the wire), loads on first use and is kept by the service worker.
// The worker holds one voice at a time; switching voices loads the new one.
export const VOICES = {
  riccardo: { name: 'Riccardo', sex: 'male', file: 'it_IT-riccardo-x_low', mb: 28 },
  paola: { name: 'Paola', sex: 'female', file: 'it_IT-paola-medium', mb: 64 },
  serena: { name: 'Serena', sex: 'female', file: 'it_IT-serena-medium', mb: 64 },
};
const url = (voice) => new URL(`../voices/${VOICES[voice].file}.onnx`, import.meta.url).href;

const AC = window.AudioContext || window.webkitAudioContext;
export const piperSupported = !!(AC && window.Worker && window.WebAssembly);

let worker = null, ctx = null, source = null, seq = 0, nextId = 0;
let loaded = { voice: null, state: 'idle' };   // state: loading | ready | failed
const pending = new Map();
const cache = new Map();        // `${voice}|${rate}|${text}` -> {samples, sampleRate}, most recent last

function call(voice, msg) {
  if (!worker) {
    worker = new Worker(new URL('./tts-worker.js', import.meta.url));
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id); pending.delete(data.id);
      if (data.error) p?.reject(new Error(data.error)); else p?.resolve(data);
    };
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ id, voice: url(voice), ...msg }); });
}

// Start loading a voice; returns its state (ready once it can speak).
export function warmUp(voice) {
  if (loaded.voice !== voice) {
    const mine = loaded = { voice, state: 'loading' };
    call(voice, {}).then(() => { mine.state = 'ready'; }, (e) => { mine.state = 'failed'; console.warn(`Piper voice ${voice} unavailable:`, e.message); });
  }
  return loaded.state;
}
export const piperReady = (voice) => loaded.voice === voice && loaded.state === 'ready';

export async function synth(text, rate = 1, voice = 'riccardo') {
  const key = `${voice}|${rate}|${text}`;
  let hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  hit = await call(voice, { text, rate });
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

// onend fires when the audio finishes, not when it's cut off by another call.
export async function speakPiper(text, { voice, rate = 1, onend } = {}) {
  stopPiper();
  const mine = seq;
  unlockAudio();
  let clip;
  try { clip = await synth(text, rate, voice); } catch (e) { if (mine !== seq) return; throw e; }
  if (mine !== seq) return;
  const buf = ctx.createBuffer(1, clip.samples.length, clip.sampleRate);
  buf.copyToChannel(clip.samples, 0);
  source = ctx.createBufferSource();
  source.buffer = buf;
  source.connect(ctx.destination);
  source.onended = () => { if (mine === seq) { source = null; onend?.(); } };
  source.start();
}
