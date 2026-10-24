import * as Tone from 'tone'

export async function startAudio(): Promise<void> {
  if (Tone.getContext().state !== 'running') {
    await Tone.start()
  }
}
