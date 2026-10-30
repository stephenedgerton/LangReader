// Piper text-to-speech, off the main thread: espeak-ng turns Italian text into phoneme ids,
// then the voice's VITS model (ONNX Runtime, WebAssembly) turns those into audio samples.
// A classic worker, so the two vendored Emscripten/UMD scripts load with importScripts.
importScripts('../vendor/piper/piper_phonemize.js', '../vendor/onnxruntime/ort.wasm.min.js');

const PIPER = '../vendor/piper/';
const get = async (url, as) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r[as](); };
let phonemizer = null;          // the phonemizer's wasm and data, shared by every voice
let engine = null;              // {voice, ready}: one voice in memory at a time

function load(voice) {
  if (engine?.voice === voice) return engine.ready;
  const old = engine;
  const mine = engine = { voice };
  mine.ready = (async () => {
    // Threads need cross-origin isolation, which GitHub Pages can't give us.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = new URL('../vendor/onnxruntime/', location.href).href;
    phonemizer ||= Promise.all([get(PIPER + 'piper_phonemize.wasm', 'arrayBuffer'), get(PIPER + 'piper_phonemize.data', 'arrayBuffer')])
      .catch((e) => { phonemizer = null; throw e; });
    const [config, model, [wasm, data]] = await Promise.all([get(voice + '.json', 'json'), get(voice, 'arrayBuffer'), phonemizer]);
    const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
    return { config, session, wasm, data };
  })().catch((e) => { if (engine === mine) engine = null; throw e; });
  old?.ready.then((e) => e.session.release(), () => {});
  return mine.ready;
}

// piper_phonemize is a command-line program: one fresh instance per call (it's small, and
// its files are already in memory), printing one JSON line of phoneme ids per sentence.
async function phonemize({ config, wasm, data }, text) {
  const lines = [];
  const mod = await createPiperPhonemize({
    wasmBinary: wasm,
    getPreloadedPackage: () => data,
    print: (l) => lines.push(l),
    printErr: () => {},
  });
  mod.callMain(['-l', config.espeak.voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  return lines.map((l) => { try { return JSON.parse(l).phoneme_ids; } catch { return null; } }).filter((ids) => ids?.length);
}

async function synthesize(voice, text, rate) {
  const eng = await load(voice);
  const { noise_scale, length_scale, noise_w } = eng.config.inference;
  const sampleRate = eng.config.audio.sample_rate;
  const gap = new Float32Array(Math.round(sampleRate * 0.25));
  const parts = [];
  for (const ids of await phonemize(eng, text)) {
    const { output } = await eng.session.run({
      input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.of(BigInt(ids.length)), [1]),
      scales: new ort.Tensor('float32', Float32Array.of(noise_scale, length_scale / rate, noise_w), [3]),
    });
    if (parts.length) parts.push(gap);
    parts.push(output.data);
  }
  const samples = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { samples.set(p, at); at += p.length; }
  return { samples, sampleRate };
}

self.onmessage = async ({ data: { id, voice, text, rate } }) => {
  try {
    if (text == null) { await load(voice); self.postMessage({ id }); return; }
    const out = await synthesize(voice, text, rate || 1);
    self.postMessage({ id, ...out }, [out.samples.buffer]);
  } catch (e) {
    self.postMessage({ id, error: String(e?.message || e) });
  }
};
