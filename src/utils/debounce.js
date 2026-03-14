/**
 * Debounce — verzögert die Ausführung bis keine weiteren Aufrufe
 * innerhalb von `delay` ms kommen. Verhindert Kaskaden-Fetches
 * bei mehreren Realtime-Events in kurzer Folge.
 */
export function debounce(fn, delay) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}
