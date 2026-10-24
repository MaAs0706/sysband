import * as THREE from 'three'
import type { InstrumentId } from '../audio/instruments'
import type { PlayerInfo } from '../net/session'
import { PLAYER_COLORS, remoteColorFor } from '../net/session'
import {
  buildStationModel,
  buildStylizedMusician,
  type MusicianModel,
  type StationModel,
} from './models'

const STATION_CONFIGS: {
  instrument: InstrumentId
  title: string
  x: number
  z: number
  rotY: number
  accentHex: number
}[] = [
  {
    instrument: 'drums',
    title: 'Drums',
    x: -2.55,
    z: -1.15,
    rotY: 0.36,
    accentHex: 0x38bdf8,
  },
  {
    instrument: 'piano',
    title: 'Grand Piano',
    x: 0,
    z: -1.65,
    rotY: 0,
    accentHex: 0xa78bfa,
  },
  {
    instrument: 'guitar',
    title: 'Electric Guitar',
    x: 2.55,
    z: -1.15,
    rotY: -0.36,
    accentHex: 0xf59e0b,
  },
]

const AVATAR_OFFSETS = [
  { x: 0, z: -0.36 },
  { x: -0.52, z: -0.44 },
]

interface StationSlot {
  musician: MusicianModel
  baseX: number
  baseZ: number
  pulse: number
}

interface StudioStation {
  instrument: InstrumentId
  title: string
  accentHex: number
  root: THREE.Group
  riserRimMat: THREE.MeshStandardMaterial
  model: StationModel
  slots: StationSlot[]
  label: THREE.Sprite
  labelCanvas: HTMLCanvasElement
  labelTex: THREE.CanvasTexture
  labelKey: string
  partPulses: Map<string, number>
  stationPulse: number
}

export interface Studio {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  resize(aspect: number): void
  setPlayers(players: PlayerInfo[], youId: string | null): void
  pulse(instrument: InstrumentId, target: string, playerId?: string): void
  step(dt: number, t: number): void
  dispose(): void
}

function drawStationBanner(
  canvas: HTMLCanvasElement,
  tex: THREE.CanvasTexture,
  title: string,
  occupants: { text: string; color: string }[],
  accentCss: string,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const occupied = occupants.length > 0
  ctx.fillStyle = occupied ? 'rgba(15, 17, 24, 0.88)' : 'rgba(15, 17, 24, 0.56)'
  ctx.strokeStyle = occupied ? accentCss : 'rgba(148, 163, 184, 0.28)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(8, 8, w - 16, h - 16, 26)
  ctx.fill()
  ctx.stroke()

  ctx.font = '600 22px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = occupied ? '#94a3b8' : '#64748b'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (!occupied) {
    ctx.fillText(`${title.toUpperCase()}  ·  AVAILABLE`, w / 2, h / 2)
  } else {
    ctx.font = '700 20px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = accentCss
    ctx.fillText(title.toUpperCase(), w / 2, 34)

    const line = occupants.map((o) => o.text).join('   •   ')
    ctx.font = '600 26px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = '#f8fafc'
    ctx.fillText(line, w / 2, 74)
  }
  tex.needsUpdate = true
}

function buildStudioArchitecture(scene: THREE.Scene) {
  // Architectural hardwood floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 18),
    new THREE.MeshStandardMaterial({
      color: 0x1e1612,
      roughness: 0.52,
      metalness: 0.08,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  // Subtle plank seam strips
  const seamMat = new THREE.MeshBasicMaterial({
    color: 0x120d0a,
    transparent: true,
    opacity: 0.55,
  })
  for (let i = -6; i <= 6; i++) {
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.015), seamMat)
    seam.rotation.x = -Math.PI / 2
    seam.position.set(0, 0.002, i * 0.75)
    scene.add(seam)
  }

  // Woven studio area rug under the ensemble
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(8.2, 4.1),
    new THREE.MeshStandardMaterial({
      color: 0x1b1f2c,
      roughness: 0.92,
      metalness: 0.02,
    }),
  )
  rug.rotation.x = -Math.PI / 2
  rug.position.set(0, 0.006, -1.25)
  scene.add(rug)

  const rugBorder = new THREE.Mesh(
    new THREE.PlaneGeometry(8.42, 4.32),
    new THREE.MeshStandardMaterial({
      color: 0x3b2f26,
      roughness: 0.85,
    }),
  )
  rugBorder.rotation.x = -Math.PI / 2
  rugBorder.position.set(0, 0.004, -1.25)
  scene.add(rugBorder)

  // Back studio wall + side acoustic walls
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x131620,
    roughness: 0.85,
  })
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(18, 7.5), wallMat)
  backWall.position.set(0, 3.75, -4.4)
  scene.add(backWall)

  for (const side of [-1, 1] as const) {
    const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(11, 7.5), wallMat)
    sideWall.position.set(side * 6.8, 3.75, -0.5)
    sideWall.rotation.y = -side * (Math.PI / 2.3)
    scene.add(sideWall)
  }

  // Acoustic timber-slat treatment panels along the back wall
  const slatWood = new THREE.MeshStandardMaterial({
    color: 0x6b442a,
    roughness: 0.48,
    metalness: 0.06,
  })
  const panelBacking = new THREE.MeshStandardMaterial({
    color: 0x0b0d13,
    roughness: 0.95,
  })

  for (const px of [-4.2, 0, 4.2]) {
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 3.1, 0.06),
      panelBacking,
    )
    backing.position.set(px, 2.15, -4.34)
    scene.add(backing)

    for (let s = -8; s <= 8; s++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 2.96, 0.08),
        slatWood,
      )
      slat.position.set(px + s * 0.13, 2.15, -4.29)
      scene.add(slat)
    }
  }

  // Warm architectural cove light strip along base & top of acoustic panels
  const coveMat = new THREE.MeshBasicMaterial({ color: 0xfde68a })
  for (const y of [0.52, 3.76]) {
    const cove = new THREE.Mesh(
      new THREE.BoxGeometry(11.6, 0.028, 0.03),
      coveMat,
    )
    cove.position.set(0, y, -4.28)
    scene.add(cove)
  }
}

export function createStudio(): Studio {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0c0e14)
  scene.fog = new THREE.FogExp2(0x0c0e14, 0.048)

  const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 40)
  camera.position.set(0, 2.45, 4.65)
  camera.lookAt(0, 0.95, -1.35)

  // Balanced studio lighting: warm key + cool fill + ceiling downlights
  const hemi = new THREE.HemisphereLight(0xfff1e0, 0x1c2033, 0.85)
  scene.add(hemi)

  const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.35)
  keyLight.position.set(2.5, 6.5, 4.5)
  scene.add(keyLight)

  const warmWash = new THREE.PointLight(0xfbbf24, 2.4, 14)
  warmWash.position.set(0, 3.6, -3.6)
  scene.add(warmWash)

  buildStudioArchitecture(scene)

  const stations: StudioStation[] = STATION_CONFIGS.map((cfg) => {
    const root = new THREE.Group()
    root.position.set(cfg.x, 0, cfg.z)
    root.rotation.y = cfg.rotY
    scene.add(root)

    // Low-profile carpeted instrument riser
    const riser = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.24, 0.07, 48),
      new THREE.MeshStandardMaterial({
        color: 0x171a24,
        roughness: 0.65,
        metalness: 0.2,
      }),
    )
    riser.position.y = 0.035
    root.add(riser)

    const riserRimMat = new THREE.MeshStandardMaterial({
      color: cfg.accentHex,
      emissive: cfg.accentHex,
      emissiveIntensity: 0.25,
      roughness: 0.35,
      metalness: 0.5,
    })
    const riserRim = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.016, 12, 56),
      riserRimMat,
    )
    riserRim.rotation.x = Math.PI / 2
    riserRim.position.y = 0.072
    root.add(riserRim)

    const model = buildStationModel(cfg.instrument)
    model.root.position.y = 0.07
    root.add(model.root)

    const slots: StationSlot[] = AVATAR_OFFSETS.map((off) => {
      const musician = buildStylizedMusician()
      musician.root.position.set(off.x, 0.07, off.z)
      musician.root.visible = false
      root.add(musician.root)
      return {
        musician,
        baseX: off.x,
        baseZ: off.z,
        pulse: 0,
      }
    })

    const labelCanvas = document.createElement('canvas')
    labelCanvas.width = 640
    labelCanvas.height = 112
    const labelTex = new THREE.CanvasTexture(labelCanvas)
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: labelTex,
        transparent: true,
        depthTest: false,
      }),
    )
    label.position.set(0, 2.08, -0.18)
    label.scale.set(2.05, 0.36, 1)
    root.add(label)

    return {
      instrument: cfg.instrument,
      title: cfg.title,
      accentHex: cfg.accentHex,
      root,
      riserRimMat,
      model,
      slots,
      label,
      labelCanvas,
      labelTex,
      labelKey: '',
      partPulses: new Map(),
      stationPulse: 0,
    }
  })

  const setPlayers = (players: PlayerInfo[], youId: string | null) => {
    for (const st of stations) {
      const assigned = players.filter((p) => p.instrument === st.instrument)
      const occupied = assigned.length > 0
      st.riserRimMat.emissiveIntensity = occupied ? 0.85 : 0.16
      st.model.accentLight.intensity = occupied ? 1.85 : 0.55

      st.slots.forEach((slot, idx) => {
        const player = assigned[idx]
        if (!player) {
          slot.musician.root.visible = false
          return
        }
        const isYou = player.id === youId
        const hex = isYou
          ? '#c084fc'
          : PLAYER_COLORS[remoteColorFor(player.id) % PLAYER_COLORS.length]
        slot.musician.root.visible = true
        slot.musician.accentMat.color.set(hex)
        slot.musician.accentMat.emissive.set(hex)
        slot.musician.jacketMat.emissive.set(hex)
        slot.musician.jacketMat.emissiveIntensity = isYou ? 0.22 : 0.14
        // Center single player, spread gently when two share a station
        slot.musician.root.position.x =
          assigned.length === 1 ? 0 : idx === 0 ? -0.32 : 0.32
      })

      const occupants = assigned.map((p) => ({
        text: `${p.name}${p.id === youId ? ' (you)' : ''}`,
        color:
          p.id === youId
            ? '#c084fc'
            : PLAYER_COLORS[remoteColorFor(p.id) % PLAYER_COLORS.length],
      }))
      const accentCss = `#${st.accentHex.toString(16).padStart(6, '0')}`
      const nextKey = JSON.stringify(occupants)
      if (st.labelKey !== nextKey) {
        st.labelKey = nextKey
        drawStationBanner(
          st.labelCanvas,
          st.labelTex,
          st.title,
          occupants,
          accentCss,
        )
      }
    }
  }
  setPlayers([], null)

  return {
    scene,
    camera,
    resize(aspect) {
      camera.aspect = aspect
      camera.fov = aspect < 1 ? 58 : 44
      camera.updateProjectionMatrix()
    },
    setPlayers,
    pulse(instrument, target) {
      const st = stations.find((s) => s.instrument === instrument)
      if (!st) return
      st.partPulses.set(target, 1)
      st.stationPulse = 1
      for (const slot of st.slots) {
        if (slot.musician.root.visible) slot.pulse = 1
      }
    },
    step(dt, t) {
      stations.forEach((st, stIdx) => {
        st.stationPulse *= Math.exp(-dt * 6)
        if (st.stationPulse < 0.001) st.stationPulse = 0

        st.slots.forEach((slot, sIdx) => {
          if (!slot.musician.root.visible) return
          slot.pulse *= Math.exp(-dt * 8)
          if (slot.pulse < 0.001) slot.pulse = 0

          const breathe = Math.sin(t * 2.1 + stIdx + sIdx) * 0.015
          slot.musician.root.position.y = 0.07 + breathe
          slot.musician.head.rotation.x =
            Math.sin(t * 3.2 + stIdx) * 0.04 + slot.pulse * 0.14
          slot.musician.rightArm.rotation.x = -slot.pulse * 0.35
          slot.musician.leftArm.rotation.x = -slot.pulse * 0.22
        })

        for (const [key, part] of st.model.parts) {
          const prev = st.partPulses.get(key) ?? 0
          const v = prev * Math.exp(-dt * 7.5)
          const clamped = v < 0.001 ? 0 : v
          st.partPulses.set(key, clamped)

          if (st.instrument === 'piano') {
            part.mesh.position.y = part.baseY - clamped * 0.022
            part.mat.emissiveIntensity = 0.06 + clamped * 1.4
          } else if (st.instrument === 'guitar') {
            const p = st.stationPulse
            part.mat.emissiveIntensity = 0.18 + p * 1.15
            part.mesh.rotation.z = 0.28 + Math.sin(t * 32) * p * 0.04
          } else {
            part.mesh.position.y = part.baseY - clamped * 0.03
            part.mesh.scale.set(
              1 + clamped * 0.14,
              1 - clamped * 0.1,
              1 + clamped * 0.14,
            )
            part.mat.emissiveIntensity = 0.15 + clamped * 1.45
          }
        }
      })
    },
    dispose() {
      for (const st of stations) st.labelTex.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
          obj.geometry.dispose()
          const m = obj.material
          if (Array.isArray(m)) m.forEach((x) => x.dispose())
          else m.dispose()
        }
      })
    },
  }
}
