import * as Tone from 'tone'

let kick: Tone.MembraneSynth | null = null
let snare: Tone.NoiseSynth | null = null
let hihat: Tone.MetalSynth | null = null

function synths() {
  if (!kick || !snare || !hihat) {
    kick = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 7,
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.2 },
    }).toDestination()

    snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.17, sustain: 0 },
    }).toDestination()
    snare.volume.value = -8

    hihat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.07, release: 0.02 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).toDestination()
    hihat.volume.value = -14
  }
  return { kick, snare, hihat }
}

export function triggerKick(velocity = 0.9): void {
  synths().kick.triggerAttackRelease('C1', '8n', Tone.now(), velocity)
}

export function triggerSnare(velocity = 0.9): void {
  synths().snare.triggerAttackRelease('16n', Tone.now(), velocity)
}

export function triggerHiHat(velocity = 0.7): void {
  synths().hihat.triggerAttackRelease('G5', '32n', Tone.now(), velocity)
}

export function disposeDrums(): void {
  kick?.dispose()
  snare?.dispose()
  hihat?.dispose()
  kick = snare = hihat = null
}
