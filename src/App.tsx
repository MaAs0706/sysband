import { useCallback, useEffect, useRef, useState } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { createHandLandmarker, INDEX_FINGERTIP } from './vision/handTracker'
import { startAudio } from './audio/engine'
import { triggerHiHat, triggerKick, triggerSnare } from './audio/drums'
import {
  padAt,
  StrikeDetector,
  type DrumId,
} from './scene/hitZones'
import DrumScene, {
  type DrumSceneHandle,
  type Finger,
} from './scene/DrumScene'
import DrumTestPanel from './ui/DrumTestPanel'
import './App.css'

type Status = 'idle' | 'starting' | 'running' | 'error'

const DRUM_TRIGGERS: Record<DrumId, (velocity?: number) => void> = {
  kick: triggerKick,
  snare: triggerSnare,
  hihat: triggerHiHat,
}

const FINGER_SMOOTHING = 0.55

const DRUM_LABELS: Record<DrumId, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hihat: 'Hi-hat',
}

function describeError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
        return 'Camera access was denied. Allow camera permission for this site and try again.'
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'No camera was found on this device.'
      case 'NotReadableError':
        return 'The camera is already in use by another application.'
      default:
        break
    }
  }
  return 'Failed to start tracking. Check your connection and try again.'
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [step, setStep] = useState('')
  const [handVisible, setHandVisible] = useState(false)
  const [lastHit, setLastHit] = useState('')
  const [aspectRatio, setAspectRatio] = useState('16 / 9')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sceneRef = useRef<DrumSceneHandle | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanupRef.current?.(), [])

  const stop = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    sceneRef.current?.setFingers([])
    setHandVisible(false)
    setStatus('idle')
  }, [])

  const start = async () => {
    const video = videoRef.current
    if (!video) return

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access needs a secure context — use localhost or HTTPS.')
      setStatus('error')
      return
    }

    setError('')
    setStatus('starting')
    void startAudio().catch(() => {})

    let disposed = false
    let rafId = 0
    let stream: MediaStream | null = null
    let landmarker: HandLandmarker | null = null

    cleanupRef.current = () => {
      disposed = true
      cancelAnimationFrame(rafId)
      stream?.getTracks().forEach((track) => track.stop())
      landmarker?.close()
      const v = videoRef.current
      if (v) v.srcObject = null
      sceneRef.current?.setFingers([])
    }

    try {
      setStep('Requesting camera access…')
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      setStep('Starting video…')
      video.srcObject = stream
      if (video.readyState < 1) {
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => resolve()
        })
      }
      await video.play()

      setStep('Loading hand tracker…')
      landmarker = await createHandLandmarker()
      if (disposed) return

      const aspect = video.videoWidth / video.videoHeight
      setAspectRatio(`${video.videoWidth} / ${video.videoHeight}`)

      const tracker = landmarker
      const detector = new StrikeDetector()
      const handStates = new Map<
        string,
        { x: number; y: number; prevY: number; prevT: number }
      >()

      let lastTime = -1
      let lastVisible = false
      const tick = () => {
        if (disposed) return
        if (video.readyState >= 2 && video.currentTime !== lastTime) {
          lastTime = video.currentTime
          const now = performance.now()
          const result = tracker.detectForVideo(video, now)
          const fingers: Finger[] = []
          const seen = new Set<string>()
          for (let i = 0; i < result.landmarks.length && i < 2; i++) {
            const tip = result.landmarks[i]?.[INDEX_FINGERTIP]
            if (!tip) continue
            const key =
              result.handedness[i]?.[0]?.categoryName ?? `hand${i}`
            seen.add(key)
            let st = handStates.get(key)
            if (!st) {
              st = { x: 1 - tip.x, y: tip.y, prevY: tip.y, prevT: now }
              handStates.set(key, st)
            }
            st.x += (1 - tip.x - st.x) * FINGER_SMOOTHING
            st.y += (tip.y - st.y) * FINGER_SMOOTHING
            const vy = (st.y - st.prevY) / Math.max((now - st.prevT) / 1000, 0.001)
            st.prevY = st.y
            st.prevT = now
            fingers.push({ x: st.x, y: st.y })
            const strike = detector.update(padAt(st.x, st.y, aspect), vy, now)
            if (strike) {
              void startAudio().catch(() => {})
              DRUM_TRIGGERS[strike.id](strike.strength)
              sceneRef.current?.flash(strike.id)
              setLastHit(DRUM_LABELS[strike.id])
            }
          }
          for (const key of handStates.keys()) {
            if (!seen.has(key)) handStates.delete(key)
          }
          const visible = fingers.length > 0
          if (visible !== lastVisible) {
            lastVisible = visible
            setHandVisible(visible)
          }
          sceneRef.current?.setFingers(fingers)
        }
        rafId = requestAnimationFrame(tick)
      }
      tick()
      setStatus('running')
    } catch (err) {
      cleanupRef.current?.()
      cleanupRef.current = null
      setError(describeError(err))
      setStatus('error')
    }
  }

  return (
    <main className="app">
      <header className="header">
        <h1>RoomTone</h1>
        <p>Virtual drum kit — strike downward through a pad</p>
      </header>

      <div className="stage" style={{ aspectRatio }}>
        <video ref={videoRef} playsInline muted autoPlay />
        <DrumScene
          ref={sceneRef}
          onError={(message) => {
            setError(message)
            setStatus('error')
          }}
        />

        {status !== 'running' && (
          <div className="stage-overlay">
            {status === 'idle' && (
              <button type="button" className="primary" onClick={start}>
                Enable Camera
              </button>
            )}
            {status === 'starting' && <p className="loading">{step}</p>}
            {status === 'error' && (
              <>
                <p className="error">{error}</p>
                <button type="button" className="primary" onClick={start}>
                  Try Again
                </button>
              </>
            )}
          </div>
        )}

        {status === 'running' && (
          <div className={`hud ${handVisible ? 'on' : ''}`}>
            <span className="hud-dot" />
            {handVisible ? 'tracking fingertip' : 'show your hand'}
            {lastHit && <span className="hud-last">last: {lastHit}</span>}
          </div>
        )}
      </div>

      {status === 'running' && (
        <button type="button" className="secondary" onClick={stop}>
          Disable camera
        </button>
      )}

      <DrumTestPanel />
    </main>
  )
}
