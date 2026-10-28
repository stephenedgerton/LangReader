// Keeping the on-device data safe: persistent storage, backup reminders, and saving files on iPhone.
const LAST_BACKUP = 'langreader.lastBackup';
const SNOOZE = 'langreader.backupSnooze';
const DAY = 86400000;

// Ask the browser not to evict our IndexedDB data under storage pressure.
export async function requestPersistence() {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}

export async function isPersisted() {
  try { return navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch { return null; }
}

const getTime = (k) => { try { return +localStorage.getItem(k) || 0; } catch { return 0; } };
const setTime = (k, t) => { try { localStorage.setItem(k, String(t)); } catch {} };

export const lastBackup = () => getTime(LAST_BACKUP);
export const markBackedUp = () => setTime(LAST_BACKUP, Date.now());
export const snoozeBackup = (days = 7) => setTime(SNOOZE, Date.now() + days * DAY);

// Remind once there's vocabulary worth losing and the last backup is two weeks old (or never happened).
export function backupDue(wordCount) {
  if (wordCount < 25) return false;
  if (Date.now() < getTime(SNOOZE)) return false;
  return Date.now() - lastBackup() > 14 * DAY;
}

export function backupAge() {
  const t = lastBackup();
  if (!t) return 'never';
  const d = Math.floor((Date.now() - t) / DAY);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

// On iPhone the share sheet offers "Save to Files", which works in the home-screen app;
// elsewhere fall back to a normal download. Resolves true if the file was handed off.
export async function saveFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; /* fall through to download */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}
