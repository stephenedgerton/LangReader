// Tokenising Italian text into clickable words, LingQ-style.
//
// Elisions are split the way LingQ does: "dell'anno" -> "dell'" + "anno",
// "l'acqua" -> "l'" + "acqua". Truncations such as "po'" keep their apostrophe.

const WORD_RE = /[\p{L}\p{M}]+['’]?|\p{N}+(?:[.,]\p{N}+)*|[^\p{L}\p{M}\p{N}]+/gu;
const TRUNCATIONS = new Set(['po', 'mo', 'di', 'de', 'fa', 'va', 'sta', 'da', 'be', 'ca', 'to', 'pie', 'tie', 'vo', 'fe']);
const LETTER = /[\p{L}]/u;
const SENT_END = /[.!?…]["»”’)\]]*\s*$|[.!?…]["»”’)\]]*\s/u;

export function normalize(w) {
  return w.normalize('NFC').toLowerCase().replace(/’/g, "'");
}

// Returns [{type:'w'|'x', text}] for a string.
export function tokenize(str) {
  const out = [];
  for (const m of str.matchAll(WORD_RE)) {
    let t = m[0];
    if (LETTER.test(t[0])) {
      // A trailing apostrophe that isn't followed by a letter is only part of the
      // word for known truncations ("un po'"); otherwise it is a closing quote.
      const last = t[t.length - 1];
      if ((last === "'" || last === '’') && !LETTER.test(str[m.index + t.length] || '')) {
        const base = t.slice(0, -1);
        if (!TRUNCATIONS.has(normalize(base))) {
          out.push({ type: 'w', text: base });
          out.push({ type: 'x', text: last });
          continue;
        }
      }
      out.push({ type: 'w', text: t });
    } else {
      out.push({ type: 'x', text: t });
    }
  }
  return out;
}

export function countWords(str) {
  let n = 0;
  for (const t of tokenize(str)) if (t.type === 'w') n++;
  return n;
}

export function uniqueWords(str, set = new Set()) {
  for (const t of tokenize(str)) if (t.type === 'w') set.add(normalize(t.text));
  return set;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Build HTML for a paragraph: sentences wrap words, words carry their status class.
// `statusOf(term)` returns 0 (new), 1-4 (learning), 5 (known), -1 (ignored).
// `phrases` is a Map firstWord -> [{term, parts: [w1, w2, ...]}] (longest first).
export function paragraphHTML(str, statusOf, phrases) {
  const toks = tokenize(str);
  const words = [];
  toks.forEach((t, i) => { if (t.type === 'w') { t.n = normalize(t.text); words.push(i); } });

  // Phrase detection over the word sequence. Each occurrence is wrapped as one block, so a
  // phrase that overlaps an earlier one on the page is skipped.
  if (phrases && phrases.size) {
    for (let wi = 0; wi < words.length; wi++) {
      const cands = phrases.get(toks[words[wi]].n);
      if (!cands || toks[words[wi]].ph) continue;
      for (const p of cands) {
        if (wi + p.parts.length > words.length) continue;
        let ok = true;
        for (let k = 1; k < p.parts.length; k++) {
          if (toks[words[wi + k]].n !== p.parts[k]) { ok = false; break; }
        }
        if (!ok) continue;
        for (let k = 0; k < p.parts.length; k++) toks[words[wi + k]].ph = p.term;
        toks[words[wi]].phStart = true;
        toks[words[wi + p.parts.length - 1]].phEnd = true;
        break;
      }
    }
  }

  let html = '<span class="sent">', open = null;
  const phrOpen = (term) => {
    const s = statusOf(term);
    return `<span class="phr${s >= 1 && s <= 4 ? ' s' + s : ''}" data-ph="${esc(term)}">`;
  };
  for (const t of toks) {
    if (t.type === 'w') {
      if (t.phStart) { open = t.ph; html += phrOpen(open); }
      const s = statusOf(t.n);
      const cls = s === 0 ? 'w s0' : s >= 1 && s <= 4 ? `w s${s}` : 'w';
      html += `<span class="${cls}${t.ph ? ' ph' : ''}${t.phStart ? ' ph0' : ''}" data-w="${esc(t.n)}"${t.ph ? ` data-ph="${esc(t.ph)}"` : ''}>${esc(t.text)}</span>`;
      if (t.phEnd) { open = null; html += '</span>'; }
    } else {
      // Split sentences at terminal punctuation followed by whitespace.
      const m = t.text.match(SENT_END);
      if (m) {
        // A phrase running across sentences is closed and reopened so the spans nest.
        const cut = m.index + m[0].length;
        html += esc(t.text.slice(0, cut)) + (open ? '</span>' : '') + '</span><span class="sent">' + (open ? phrOpen(open) : '') + esc(t.text.slice(cut));
      } else {
        html += esc(t.text);
      }
    }
  }
  return html + '</span>';
}

// Split a long plain text into chapters/blocks.
// Recognises headings like "CAPITOLO 1", "Capitolo II", "Chapter 3", "I.", or lines starting with "#".
const HEADING_RE = /^\s*(#{1,3}\s+.+|(capitolo|chapter|parte|libro)\s+[\divxlcdm]+\b.*|[IVXLC]+\.?\s*)$/i;

export function textToChapters(text, fallbackTitle = 'Testo') {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // Paragraphs separated by blank lines; if the text has no blank lines, each line is a paragraph.
  const hasBlank = /\n\s*\n/.test(text);
  const paras = [];
  let buf = [];
  const flush = () => { if (buf.length) { paras.push(buf.join(' ').replace(/\s+/g, ' ').trim()); buf = []; } };
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    if (HEADING_RE.test(line) && line.trim().length < 80) { flush(); paras.push({ h: line.replace(/^#+\s*/, '').trim() }); continue; }
    if (hasBlank) buf.push(line.trim()); else { buf.push(line.trim()); flush(); }
  }
  flush();

  const chapters = [];
  let cur = null;
  const MAX_WORDS = 2500; // keep chapters a comfortable lesson size
  for (const p of paras) {
    if (typeof p === 'object') {
      cur = { title: p.h, blocks: [{ t: 'h', x: p.h }], words: 0 };
      chapters.push(cur);
      continue;
    }
    if (!p) continue;
    if (!cur || cur.words > MAX_WORDS) {
      const n = chapters.length + 1;
      cur = { title: chapters.length || cur ? `${fallbackTitle} — ${n}` : fallbackTitle, blocks: [], words: 0 };
      chapters.push(cur);
    }
    cur.blocks.push({ t: 'p', x: p });
    cur.words += countWords(p);
  }
  return chapters.filter((c) => c.blocks.some((b) => b.t === 'p'));
}
