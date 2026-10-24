import { useCallback, useEffect, useRef, useState } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { createHandLandmarker, INDEX_FINGERTIP } from './vision/handTracker'
import { startAudio } from './audio/engine'
import {
  triggerInstrument,
  type InstrumentId,
} from './audio/instruments'
import {
  padAt,
  pianoKeyAt,
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
  onRemoteNote,
  remoteColorFor,
  sendCursor,
  sendNote,
  useNetState,
} from './net/session'
import './App.css'

type Status = 'idle' | 'starting' | 'running' | 'error'

const FINGER_SMOOTHING = 0.55

const DRUM_LABELS: Record<DrumId, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hihat: 'Hi-hat',
}

function formatTargetLabel(instrument: InstrumentId, target: string): string {
  if (instrument === 'drums') {
    return DRUM_LABELS[target as DrumId] ?? target
  }
  if (instrument === 'piano') return `Piano ${target}`
  return `Guitar ${target}`
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
  const instRef = useRef<InstrumentId>(net.instrument)
  useEffect(() => {
    instRef.current = net.instrument
  }, [net.instrument])

  const debugRef = useRef<DebugStats>({
    fps: 0,
    hands: 0,
    lastHit: '',
    lastVelocity: 0,
  })

  const addHit = useCallback(
    (name: string, instrument: InstrumentId, label: string) =>
      setHitFeed((f) => [
        ...f.slice(-3),
        { key: ++hitSeq, name, instrument, label },
      ]),
    [],
  )
  const expireHit = (key: number) =>
    setHitFeed((f) => f.filter((h) => h.key !== key))

  useEffect(() => () => cleanupRef.current?.(), [])

  useEffect(
    () =>
      onRemoteNote((ev) => {
        void startAudio().catch(() => {})
        triggerInstrument(ev.instrument, ev.target, ev.velocity)
        sceneRef.current?.flashNote(ev.instrument, ev.target, ev.playerId)
        addHit(ev.name, ev.instrument, formatTargetLabel(ev.instrument, ev.target))
      }),
    [addHit],
  )

  const remoteRef = useRef(
    new Map<string, { hands: { x: number; y: number }[]; at: number }>(),
  )
  useEffect(() => {
    const remote = remoteRef.current
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
      sceneRef.current?.setRemoteFingers(list)
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
      apply()
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
          insideZone: string | null
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
          const activeInst = instRef.current

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
                insideZone: null,
              }
              handStates.set(key, st)
            }
            const prevSmoothedY = st.y
            st.x += (1 - tip.x - st.x) * FINGER_SMOOTHING
            st.y += (tip.y - st.y) * FINGER_SMOOTHING
            const vy =
              (st.y - st.prevY) / Math.max((now - st.prevT) / 1000, 0.001)
            st.prevY = st.y
            st.prevT = now
            fingers.push({ x: st.x, y: st.y })

            if (activeInst === 'drums') {
              const pad = padAt(st.x, st.y, aspect)
              const entered = pad !== null && pad.id !== st.insideZone
              st.insideZone = pad?.id ?? null
              const strike = detector.update(pad, entered, vy, now)
              if (strike) {
                void startAudio().catch(() => {})
                triggerInstrument('drums', strike.id, strike.velocity)
                sceneRef.current?.flashNote('drums', strike.id)
                sendNote('drums', strike.id, strike.velocity)
                const label = DRUM_LABELS[strike.id]
                addHit('You', 'drums', label)
                debugRef.current.lastHit = label
                debugRef.current.lastVelocity = vy
              }
            } else if (activeInst === 'piano') {
              const kz = pianoKeyAt(st.x, st.y)
              const entered = kz !== null && kz.note !== st.insideZone
              st.insideZone = kz?.note ?? null
              const noteHit = detector.updatePiano(kz, entered, vy, now)
              if (noteHit) {
                void startAudio().catch(() => {})
                triggerInstrument('piano', noteHit.target, noteHit.velocity)
                sceneRef.current?.flashNote('piano', noteHit.target)
                sendNote('piano', noteHit.target, noteHit.velocity)
                addHit('You', 'piano', noteHit.label)
                debugRef.current.lastHit = noteHit.label
                debugRef.current.lastVelocity = vy
              }
            } else if (activeInst === 'guitar') {
              const strum = detector.updateGuitar(
                prevSmoothedY,
                st.x,
                st.y,
                vy,
                now,
              )
              if (strum) {
                void startAudio().catch(() => {})
                triggerInstrument('guitar', strum.target, strum.velocity)
                sceneRef.current?.flashNote('guitar', strum.target)
                sendNote('guitar', strum.target, strum.velocity)
                addHit('You', 'guitar', strum.label)
                debugRef.current.lastHit = strum.label
                debugRef.current.lastVelocity = Math.abs(vy)
              }
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
            <video
              ref={videoRef}
              className={status === 'running' ? 'pip' : 'pip hidden'}
              playsInline
              muted
              autoPlay
            />
            <DrumScene
              ref={sceneRef}
              players={net.players}
              youId={net.you?.id ?? null}
              instrument={net.instrument}
              onError={(message) => {
                setError(message)
                setStatus('error')
              }}
            />

            {status === 'idle' && (
              <div className="cam-cta">
                <button type="button" className="primary" onClick={start}>
                  Enable Camera to Play
                </button>
              </div>
            )}
            {status === 'starting' && (
              <div className="cam-cta">
                <p className="loading">{step}</p>
              </div>
            )}
            {status === 'error' && (
              <div className="cam-cta">
                <p className="error">{error}</p>
                <button type="button" className="primary" onClick={start}>
                  Try Again
                </button>
              </div>
            )}

            {status === 'running' && (
              <div className={`hud ${handVisible ? 'on' : ''}`}>
                <span className="hud-dot" />
                {handVisible
                  ? `tracking · ${net.instrument}`
                  : 'show your hand'}
              </div>
            )}

            <HitFeed items={hitFeed} onExpire={expireHit} />

            {status === 'running' && showDebug && (
              <DebugOverlay source={debugRef} />
            )}
          </div>

          <DrumTestPanel
            onTrigger={(inst, target, label) => {
              sceneRef.current?.flashNote(inst, target)
              addHit('You', inst, label)
            }}
          />

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
        </div>
      )}
    </main>
  )
}
