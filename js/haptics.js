// A light haptic "tick". Android/Chrome has the Vibration API; iPhone Safari doesn't, but since
// iOS 18 toggling a native switch control plays the system haptic, so we click a hidden one.
// Must be called synchronously from a user gesture (tap/click handler).
import { settings } from './settings.js';

let label = null;

// Vibration works from timers too. The iOS switch only clicks during a user gesture, and a touch
// becomes one when the finger lifts, so a long press can't tick until it's released.
export const hapticAnytime = typeof navigator.vibrate === 'function';

export function haptic() {
  if (!settings.haptics) return;
  if (hapticAnytime) { navigator.vibrate(8); return; }
  if (!label) {
    label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
  }
  label.click();
}
