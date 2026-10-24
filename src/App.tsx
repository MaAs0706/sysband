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
  type RemoteFinger,
} from './scene/DrumScene'
import DrumTestPanel from './ui/DrumTestPanel'
import DebugOverlay, { type DebugStats } from './ui/DebugOverlay'
import Landing from './ui/Landing'
import RoomBar from './ui/RoomBar'
import HitFeed, { type HitItem } from './ui/HitFeed'
import {
  onRemoteCursor,
  onRemoteHit,
  remoteColorFor,
  sendCursor,
  sendHit,
  useNetState,
} from './net/session'
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

let hitSeq = 0

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
  const net = useNetState()
  const inRoom = Boolean(net.roomId)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [step, setStep] = useState('')
  const [handVisible, setHandVisible] = useState(false)
  const [aspectRatio, setAspectRatio] = useState('16 / 9')
  const [showDebug, setShowDebug] = useState(false)
  const [hitFeed, setHitFeed] = useState<HitItem[]>([])
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sceneRef = useRef<DrumSceneHandle | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const debugRef = useRef<DebugStats>({
    fps: 0,
    hands: 0,
    lastHit: '',
    lastVelocity: 0,
  })

  const addHit = (name: string, drum: DrumId) =>
    setHitFeed((f) => [...f.slice(-3), { key: ++hitSeq, name, drum }])
  const expireHit = (key: number) =>
    setHitFeed((f) => f.filter((h) => h.key !== key))

  useEffect(() => () => cleanupRef.current?.(), [])

  useEffect(
    () =>
      onRemoteHit((hit) => {
        void startAudio().catch(() => {})
        DRUM_TRIGGERS[hit.drum](hit.velocity)
        sceneRef.current?.flash(hit.drum)
        addHit(hit.name, hit.drum)
      }),
    [],
  )

  const remoteRef = useRef(
    new Map<string, { hands: { x: number; y: number }[]; at: number }>(),
  )
  useEffect(() => {
    const remote = remoteRef.current
    const scene = sceneRef.current
    const apply = () => {
      const now = performance.now()
      const list: RemoteFinger[] = []
      for (const [pid, c] of remote) {
        if (now - c.at > 600) {
          remote.delete(pid)
          continue
        }
        const colorIdx = remoteColorFor(pid)
        for (const h of c.hands) list.push({ x: h.x, y: h.y, colorIdx })
      }
      scene?.setRemoteFingers(list)
    }
    const off = onRemoteCursor((cursor) => {
      remote.set(cursor.playerId, {
        hands: cursor.hands,
        at: performance.now(),
      })
      apply()
    })
    const id = window.setInterval(apply, 250)
    return () => {
      off()
      window.clearInterval(id)
      remote.clear()
      scene?.setRemoteFingers([])
    }
  }, [])

  const stop = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    sceneRef.current?.setFingers([])
    setHandVisible(false)
    setStatus('idle')
  }, [])

  useEffect(() => {
    if (inRoom) return
    const id = window.setTimeout(stop, 0)
    return () => window.clearTimeout(id)
  }, [inRoom, stop])

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

      stream.getTracks().forEach((track) =>
        track.addEventListener('ended', stop),
      )

      const tracker = landmarker
      const detector = new StrikeDetector()
      const handStates = new Map<
        string,
        {
          x: number
          y: number
          prevY: number
          prevT: number
          insidePad: DrumId | null
        }
      >()

      let lastTime = -1
      let lastVisible = false
      let lastFrameAt = 0
      let fps = 0
      const tick = () => {
        if (disposed) return
        if (video.readyState >= 2 && video.currentTime !== lastTime) {
          lastTime = video.currentTime
          const now = performance.now()
          if (lastFrameAt) {
            fps += (1000 / Math.max(now - lastFrameAt, 1) - fps) * 0.1
          }
          lastFrameAt = now
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
              st = {
                x: 1 - tip.x,
                y: tip.y,
                prevY: tip.y,
                prevT: now,
                insidePad: null,
              }
              handStates.set(key, st)
            }
            st.x += (1 - tip.x - st.x) * FINGER_SMOOTHING
            st.y += (tip.y - st.y) * FINGER_SMOOTHING
            const vy = (st.y - st.prevY) / Math.max((now - st.prevT) / 1000, 0.001)
            st.prevY = st.y
            st.prevT = now
            fingers.push({ x: st.x, y: st.y })
            const pad = padAt(st.x, st.y, aspect)
            const entered = pad !== null && pad.id !== st.insidePad
            st.insidePad = pad?.id ?? null
            const strike = detector.update(pad, entered, vy, now)
            if (strike) {
              void startAudio().catch(() => {})
              DRUM_TRIGGERS[strike.id](strike.velocity)
              sceneRef.current?.flash(strike.id)
              sendHit(strike.id, strike.velocity)
              addHit('You', strike.id)
              debugRef.current.lastHit = DRUM_LABELS[strike.id]
              debugRef.current.lastVelocity = vy
            }
          }
          for (const key of handStates.keys()) {
            if (!seen.has(key)) handStates.delete(key)
          }
          debugRef.current.fps = fps
          debugRef.current.hands = fingers.length
          const visible = fingers.length > 0
          if (visible !== lastVisible) {
            lastVisible = visible
            setHandVisible(visible)
          }
          sceneRef.current?.setFingers(fingers)
          sendCursor(fingers)
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
      {!inRoom ? (
        <Landing />
      ) : (
        <div className="room-screen">
          <RoomBar />

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
                  <>
                    <button type="button" className="primary" onClick={start}>
                      Enable Camera
                    </button>
                    <p className="stage-hint">
                      You can also just listen — remote hits still play.
                    </p>
                  </>
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
              </div>
            )}

            <HitFeed items={hitFeed} onExpire={expireHit} />

            {status === 'running' && showDebug && (
              <DebugOverlay source={debugRef} />
            )}
          </div>

          <div className="room-controls">
            {status === 'running' && (
              <button type="button" className="secondary" onClick={stop}>
                Disable camera
              </button>
            )}
            <button
              type="button"
              className="debug-toggle"
              onClick={() => setShowDebug((d) => !d)}
            >
              {showDebug ? 'hide debug' : 'debug'}
            </button>
          </div>

          {showDebug && <DrumTestPanel />}
        </div>
      )}
    </main>
  )
}
