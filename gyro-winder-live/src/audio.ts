/** Web Audio ticks + phone tilt. Nothing is created until unlock()/ensure() runs inside a user gesture. */
export function createAudio() {
  let actx: AudioContext | null = null
  const tilt = { x: 0, y: 0 }
  const onTilt = (e: DeviceOrientationEvent) => { tilt.x = Math.max(-1, Math.min(1, (e.gamma || 0) / 35)); tilt.y = Math.max(-1, Math.min(1, ((e.beta || 0) - 45) / 35)) }
  function ensure() {
    try { if (!actx) actx = new (window.AudioContext || (window as any).webkitAudioContext)(); if (actx.state === 'suspended') actx.resume() } catch {}
  }
  async function unlock() {
    ensure()
    try {
      const DOE: any = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null
      if (DOE && DOE.requestPermission) { if (await DOE.requestPermission() === 'granted') addEventListener('deviceorientation', onTilt) } else if (DOE) addEventListener('deviceorientation', onTilt)
    } catch {}
  }
  function tick(strength: number) {
    if (!actx) return
    const n = actx.createBuffer(1, actx.sampleRate * .03, actx.sampleRate), ch = n.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3)
    const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain()
    s.buffer = n; f.type = 'bandpass'; f.frequency.value = 2600 + Math.random() * 600; f.Q.value = 6; g.gain.value = .25 * strength
    s.connect(f).connect(g).connect(actx.destination); s.start()
  }
  return { unlock, ensure, tick, tilt, state: () => actx ? actx.state : 'none' }
}
