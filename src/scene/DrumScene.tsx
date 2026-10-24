import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import * as THREE from 'three'
import { DRUM_PADS, type DrumId } from './hitZones'

export interface Finger {
  x: number
  y: number
}

export interface DrumSceneHandle {
  setFingers(fingers: Finger[]): void
  flash(id: DrumId): void
}

interface DrumSceneProps {
  onError?: (message: string) => void
}

const DrumScene = forwardRef<DrumSceneHandle, DrumSceneProps>(
  function DrumScene({ onError }, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null)
    const apiRef = useRef<DrumSceneHandle | null>(null)
    const onErrorRef = useRef(onError)
    useEffect(() => {
      onErrorRef.current = onError
    })

    useImperativeHandle(
      ref,
      () => ({
        setFingers: (fingers) => apiRef.current?.setFingers(fingers),
        flash: (id) => apiRef.current?.flash(id),
      }),
      [],
    )

    useEffect(() => {
      const mount = mountRef.current
      if (!mount) return

      let renderer: THREE.WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
      } catch {
        onErrorRef.current?.('WebGL is not available in this browser.')
        return
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      mount.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)

      const padMeshes = DRUM_PADS.map((pad) => {
        const group = new THREE.Group()
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(1, 48),
          new THREE.MeshBasicMaterial({
            color: pad.color,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.88, 1, 64),
          new THREE.MeshBasicMaterial({
            color: pad.color,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
        group.add(disc, ring)
        group.position.set(pad.cx, 1 - pad.cy, 0)
        scene.add(group)
        return { pad, group, disc, ring, flash: 0 }
      })

      const ORB_COLORS = [0xffffff, 0xc084fc]
      const orbs = ORB_COLORS.map((color) => {
        const orb = new THREE.Mesh(
          new THREE.CircleGeometry(1, 32),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
        orb.visible = false
        scene.add(orb)
        return orb
      })

      let aspect = 1
      const layout = () => {
        const w = mount.clientWidth
        const h = mount.clientHeight
        if (!w || !h) return
        renderer.setSize(w, h)
        aspect = w / h
        for (const p of padMeshes) {
          const s = 1 + p.flash * 0.18
          p.group.scale.set((p.pad.r / aspect) * s, p.pad.r * s, 1)
        }
        for (const orb of orbs) orb.scale.set(0.026 / aspect, 0.026, 1)
      }
      layout()
      const observer = new ResizeObserver(layout)
      observer.observe(mount)

      let rafId = 0
      let last = performance.now()
      const loop = (now: number) => {
        const dt = Math.min((now - last) / 1000, 0.05)
        last = now
        for (const p of padMeshes) {
          p.flash = Math.max(0, p.flash - dt * 4)
          ;(p.disc.material as THREE.MeshBasicMaterial).opacity =
            0.12 + p.flash * 0.5
          ;(p.ring.material as THREE.MeshBasicMaterial).opacity =
            0.75 + p.flash * 0.25
          const s = 1 + p.flash * 0.18
          p.group.scale.set((p.pad.r / aspect) * s, p.pad.r * s, 1)
        }
        renderer.render(scene, camera)
        rafId = requestAnimationFrame(loop)
      }
      rafId = requestAnimationFrame(loop)

      apiRef.current = {
        setFingers(fingers) {
          orbs.forEach((orb, i) => {
            const finger = fingers[i]
            orb.visible = Boolean(finger)
            if (finger) orb.position.set(finger.x, 1 - finger.y, 0.5)
          })
        },
        flash(id) {
          const p = padMeshes.find((entry) => entry.pad.id === id)
          if (p) p.flash = 1
        },
      }

      return () => {
        apiRef.current = null
        cancelAnimationFrame(rafId)
        observer.disconnect()
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose()
            ;(obj.material as THREE.Material).dispose()
          }
        })
        renderer.dispose()
        mount.removeChild(renderer.domElement)
      }
    }, [])

    return <div ref={mountRef} className="drum-scene" />
  },
)

export default DrumScene
