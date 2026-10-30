# Vendored files

Copied in unchanged (except where noted) so the app needs no CDN. They're served cache-first
by `sw.js` and never change in place: to update one, give it a new file name.

## `onnxruntime/` (ONNX Runtime Web 1.31.1, MIT, © Microsoft)
From the npm package `onnxruntime-web@1.31.1`, `dist/`: `ort.wasm.min.js` (the WebAssembly-only
build), and the `ort-wasm-simd-threaded.{mjs,wasm}` runtime it loads. Runs single-threaded
(GitHub Pages can't send the cross-origin-isolation headers threads need).

## `piper/` (piper_phonemize: piper-phonemize + espeak-ng, compiled to WebAssembly)
From the npm package `@diffusionstudio/piper-wasm@1.0.0` (MIT), `build/`. It contains
[espeak-ng](https://github.com/espeak-ng/espeak-ng) (GPL-3.0) and
[piper-phonemize](https://github.com/rhasspy/piper-phonemize) (MIT).
**Modified:** `piper_phonemize.data` holds only the espeak-ng files Italian needs (18 MB → 0.8 MB),
and the file table in `piper_phonemize.js` matches it. `trim-espeak-data.py` does this:
`python3 trim-espeak-data.py <package>/build <out-dir>`.

## `../voices/` (Piper voice `it_IT-riccardo-x_low`)
From [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices/tree/main/it/it_IT/riccardo/x_low)
on Hugging Face. Trained on the M-AILABS speech dataset; see its model card. The only male Italian Piper voice.
