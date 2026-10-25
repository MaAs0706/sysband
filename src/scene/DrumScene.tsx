import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import * as THREE from 'three'
import type { InstrumentId } from '../audio/instruments'
import type { PlayerInfo } from '../net/session'
import {
  DRUM_PADS,
  GUITAR_STRING_ZONES,
  PIANO_KEY_ZONES,
  type DrumId,
} from './hitZones'
import { createStudio } from './studio'

export interface Finger {
  x: number
  y: number
}

export interface DrumSceneHandle {
  setFingers(fingers: Finger[]): void
  setRemoteFingers(fingers: RemoteFinger[]): void
  setPlayers(players: PlayerInfo[], youId: string | null): void
  setInstrument(instrument: InstrumentId): void
  flash(id: DrumId, playerId?: string): void
  flashNote(instrument: InstrumentId, target: string, playerId?: string): void
}

export interface RemoteFinger {
  x: number
  y: number
  colorIdx: number
}

const REMOTE_COLORS = [0xfbbf24, 0x34d399, 0x60a5fa, 0xf472b6]

interface DrumSceneProps {
  players: PlayerInfo[]
  youId: string | null
  instrument: InstrumentId
  onError?: (message: string) => void
}

const DrumScene = forwardRef<DrumSceneHandle, DrumSceneProps>(
  function DrumScene({ players, youId, instrument, onError }, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null)
    const apiRef = useRef<DrumSceneHandle | null>(null)
    const onErrorRef = useRef(onError)
    const initRef = useRef({ players, youId, instrument })
    useEffect(() => {
      onErrorRef.current = onError
      initRef.current = { players, youId, instrument }
    })
    useEffect(() => {
      apiRef.current?.setPlayers(players, youId)
    }, [players, youId])
    useEffect(() => {
      apiRef.current?.setInstrument(instrument)
    }, [instrument])

    useImperativeHandle(
      ref,
      () => ({
        setFingers: (fingers) => apiRef.current?.setFingers(fingers),
        setRemoteFingers: (fingers) =>
          apiRef.current?.setRemoteFingers(fingers),
        setPlayers: (pl, id) => apiRef.current?.setPlayers(pl, id),
        setInstrument: (inst) => apiRef.current?.setInstrument(inst),
        flash: (id, playerId) => apiRef.current?.flash(id, playerId),
        flashNote: (inst, target, playerId) =>
          apiRef.current?.flashNote(inst, target, playerId),
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
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.12
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.autoClear = false
      mount.appendChild(renderer.domElement)

      const studio = createStudio()

      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)

      // 1. Drums HUD group
      const drumsHud = new THREE.Group()
      scene.add(drumsHud)
      const padMeshes = DRUM_PADS.map((pad) => {
        const group = new THREE.Group()
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(1, 48),
          new THREE.MeshBasicMaterial({
            color: pad.color,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.89, 1, 64),
          new THREE.MeshBasicMaterial({
            color: pad.color,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
        group.add(disc, ring)
        group.position.set(pad.cx, 1 - pad.cy, 0)
        drumsHud.add(group)
        return { pad, group, disc, ring, flash: 0 }
      })

      // 2. Piano HUD group (8 translucent keys along the bottom)
      const pianoHud = new THREE.Group()
      pianoHud.visible = false
      scene.add(pianoHud)
      const pianoMeshes = PIANO_KEY_ZONES.map((k) => {
        const w = (k.x1 - k.x0) * 0.9
        const h = k.y1 - k.y0
        const cy = (k.y0 + k.y1) / 2
        const fillMat = new THREE.MeshBasicMaterial({
          color: 0xa78bfa,
          transparent: true,
          opacity: 0.14,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fillMat)
        mesh.position.set(k.cx, 1 - cy, 0)
        pianoHud.add(mesh)

        const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h))
        const borderMat = new THREE.LineBasicMaterial({
          color: 0xc4b5fd,
          transparent: true,
          opacity: 0.55,
        })
        const border = new THREE.LineSegments(borderGeo, borderMat)
        border.position.set(k.cx, 1 - cy, 0.01)
        pianoHud.add(border)

        return { note: k.note, mesh, fillMat, flash: 0 }
      })

      // 3. Guitar HUD group (6 horizontal strings + voicing divider)
      const guitarHud = new THREE.Group()
      guitarHud.visible = false
      scene.add(guitarHud)
      const stringMeshes = GUITAR_STRING_ZONES.map((s) => {
        const w = s.x1 - s.x0
        const mat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(w, 0.0055),
          mat,
        )
        mesh.position.set((s.x0 + s.x1) / 2, 1 - s.y, 0)
        guitarHud.add(mesh)
        return { zone: s, mesh, mat, flash: 0 }
      })
      const fretDivider = new THREE.Mesh(
        new THREE.PlaneGeometry(0.003, 0.26),
        new THREE.MeshBasicMaterial({
          color: 0xfde68a,
          transparent: true,
          opacity: 0.3,
        }),
      )
      fretDivider.position.set(0.5, 1 - 0.79, 0)
      guitarHud.add(fretDivider)

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

      const remoteOrbs = Array.from({ length: 8 }, () => {
        const orb = new THREE.Mesh(
          new THREE.CircleGeometry(1, 32),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.75,
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
        studio.resize(aspect)
        for (const p of padMeshes) {
          const s = 1 + p.flash * 0.18
          p.group.scale.set((p.pad.r / aspect) * s, p.pad.r * s, 1)
        }
        for (const orb of orbs) orb.scale.set(0.024 / aspect, 0.024, 1)
        for (const orb of remoteOrbs)
          orb.scale.set(0.019 / aspect, 0.019, 1)
      }
      layout()
      const observer = new ResizeObserver(layout)
      observer.observe(mount)

      let rafId = 0
      let last = performance.now()
      const loop = (now: number) => {
        const dt = Math.min((now - last) / 1000, 0.05)
        last = now
        studio.step(dt, now / 1000)

        for (const p of padMeshes) {
          p.flash *= Math.exp(-dt * 5.5)
          if (p.flash < 0.001) p.flash = 0
          ;(p.disc.material as THREE.MeshBasicMaterial).opacity =
            0.1 + p.flash * 0.55
          ;(p.ring.material as THREE.MeshBasicMaterial).opacity =
            0.7 + p.flash * 0.3
          const s = 1 + p.flash * 0.22
          p.group.scale.set((p.pad.r / aspect) * s, p.pad.r * s, 1)
        }

        for (const k of pianoMeshes) {
          k.flash *= Math.exp(-dt * 6)
          if (k.flash < 0.001) k.flash = 0
          k.fillMat.opacity = 0.14 + k.flash * 0.55
        }

        for (const s of stringMeshes) {
          s.flash *= Math.exp(-dt * 7)
          if (s.flash < 0.001) s.flash = 0
          s.mat.opacity = 0.5 + s.flash * 0.5
          s.mesh.scale.y = 1 + s.flash * 2.4
        }

        renderer.clear()
        renderer.render(studio.scene, studio.camera)
        renderer.clearDepth()
        renderer.render(scene, camera)
        rafId = requestAnimationFrame(loop)
      }
      rafId = requestAnimationFrame(loop)

      const setInstrumentHud = (inst: InstrumentId) => {
        drumsHud.visible = inst === 'drums'
        pianoHud.visible = inst === 'piano'
        guitarHud.visible = inst === 'guitar'
      }

      apiRef.current = {
        setFingers(fingers) {
          orbs.forEach((orb, i) => {
            const finger = fingers[i]
            orb.visible = Boolean(finger)
            if (finger) orb.position.set(finger.x, 1 - finger.y, 0.5)
          })
        },
        setRemoteFingers(fingers) {
          remoteOrbs.forEach((orb, i) => {
            const finger = fingers[i]
            orb.visible = Boolean(finger)
            if (finger) {
              orb.position.set(finger.x, 1 - finger.y, 0.4)
              ;(orb.material as THREE.MeshBasicMaterial).color.setHex(
                REMOTE_COLORS[finger.colorIdx % REMOTE_COLORS.length],
              )
            }
          })
        },
        setPlayers(pl, id) {
          studio.setPlayers(pl, id)
        },
        setInstrument: setInstrumentHud,
        flash(id, playerId) {
          const p = padMeshes.find((entry) => entry.pad.id === id)
          if (p) p.flash = 1
          studio.pulse('drums', id, playerId)
        },
        flashNote(inst, target, playerId) {
          if (inst === 'drums') {
            const p = padMeshes.find((entry) => entry.pad.id === target)
            if (p) p.flash = 1
          } else if (inst === 'piano') {
            const k = pianoMeshes.find((entry) => entry.note === target)
            if (k) k.flash = 1
          } else if (inst === 'guitar') {
            const s = stringMeshes.find(
              (entry) =>
                entry.zone.lowNote === target || entry.zone.highNote === target,
            )
            if (s) s.flash = 1
          }
          studio.pulse(inst, target, playerId)
        },
      }
      apiRef.current.setPlayers(initRef.current.players, initRef.current.youId)
      apiRef.current.setInstrument(initRef.current.instrument)

      return () => {
        apiRef.current = null
        cancelAnimationFrame(rafId)
        observer.disconnect()
        studio.dispose()
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
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
