/** on-screen fps meter, only with ?fps. avg = rolling over ~2 s, min = slowest frame in the last 5 s. */
export function createFps(enabled: boolean) {
  if (!enabled) return { frame(_dt: number, _info: string) {}, reset() {}, stats: (): { avg: number; min: number } | null => null }
  const el = document.createElement('div'); el.id = 'fps'; document.body.appendChild(el)
  const win: [number, number][] = []; let t = 0, shown = 0, avg = 0, min = 0
  return {
    reset() { win.length = 0 },
    frame(dt: number, info: string) {
      t += dt; win.push([t, dt]); while (win.length && t - win[0][0] > 5) win.shift()
      const recent = win.filter(w => t - w[0] <= 2)
      if (recent.length) avg = recent.length / recent.reduce((a, w) => a + w[1], 0)
      min = win.length ? 1 / Math.max(...win.map(w => w[1])) : 0
      if (t - shown > .25) { shown = t; el.textContent = `avg ${avg.toFixed(0)} fps\nmin ${min.toFixed(0)} fps (5 s)\n${info}` }
    },
    stats: (): { avg: number; min: number } | null => ({ avg, min })
  }
}
