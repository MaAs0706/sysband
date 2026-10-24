import { useCallback, useEffect, useRef, useState } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { createHandLandmarker, INDEX_FINGERTIP } from './vision/handTracker'
import './App.css'

type Status = 'idle' | 'starting' | 'running' | 'error'

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
  const [aspectRatio, setAspectRatio] = useState('16 / 9')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanupRef.current?.(), [])

  const stop = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setHandVisible(false)
    setStatus('idle')
  }, [])

  const start = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access needs a secure context — use localhost or HTTPS.')
      setStatus('error')
      return
    }

    setError('')
    setStatus('starting')

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

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      setAspectRatio(`${video.videoWidth} / ${video.videoHeight}`)

      const tracker = landmarker
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context unavailable')

      let lastTime = -1
      let lastVisible = false
      const tick = () => {
        if (disposed) return
        if (video.readyState >= 2 && video.currentTime !== lastTime) {
          lastTime = video.currentTime
          const result = tracker.detectForVideo(video, performance.now())
          const tip = result.landmarks[0]?.[INDEX_FINGERTIP]
          const visible = Boolean(tip)
          if (visible !== lastVisible) {
            lastVisible = visible
            setHandVisible(visible)
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          if (tip) {
            const x = (1 - tip.x) * canvas.width
            const y = tip.y * canvas.height
            ctx.beginPath()
            ctx.arc(x, y, 14, 0, Math.PI * 2)
            ctx.shadowColor = 'rgba(192, 132, 252, 0.9)'
            ctx.shadowBlur = 18
            ctx.fillStyle = 'rgba(192, 132, 252, 0.85)'
            ctx.fill()
            ctx.shadowBlur = 0
            ctx.lineWidth = 3
            ctx.strokeStyle = '#ffffff'
            ctx.stroke()
          }
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
        <p>Hand tracking test — index fingertip</p>
      </header>

      <div className="stage" style={{ aspectRatio }}>
        <video ref={videoRef} playsInline muted autoPlay />
        <canvas ref={canvasRef} />

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
          </div>
        )}
      </div>

      {status === 'running' && (
        <button type="button" className="secondary" onClick={stop}>
          Disable camera
        </button>
      )}
    </main>
  )
}
