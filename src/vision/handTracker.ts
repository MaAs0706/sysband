import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerOptions,
} from '@mediapipe/tasks-vision'

const WASM_BASE_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export const INDEX_FINGERTIP = 8

export async function createHandLandmarker(): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL)

  const options: HandLandmarkerOptions = {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: 'VIDEO',
    numHands: 1,
  }

  try {
    return await HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'GPU' },
    })
  } catch {
    return HandLandmarker.createFromOptions(fileset, options)
  }
}
