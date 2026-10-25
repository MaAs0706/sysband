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

function makeWoodPlankTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#1d140e'
  ctx.fillRect(0, 0, 512, 512)

  const plankRows = 8
  const rowH = 512 / plankRows
  for (let r = 0; r < plankRows; r++) {
    const y = r * rowH
    const shade = 22 + ((r * 13) % 14)
    ctx.fillStyle = `rgb(${shade + 10}, ${shade}, ${Math.max(8, shade - 6)})`
    ctx.fillRect(0, y + 1, 512, rowH - 2)

    // Subtle wood grain streaks
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)'
    for (let g = 0; g < 18; g++) {
      const gy = y + ((g * 7) % (rowH - 4))
      ctx.fillRect(0, gy, 512, 1)
    }

    // Plank joint line
    ctx.fillStyle = '#090604'
    ctx.fillRect(0, y, 512, 2)
    const jointX = ((r * 173) % 420) + 40
    ctx.fillRect(jointX, y, 2, rowH)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(6, 5)
  return tex
}

function makeRugTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#151822'
  ctx.fillRect(0, 0, 512, 256)

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)'
  ctx.lineWidth = 2
  ctx.strokeRect(14, 14, 512 - 28, 256 - 28)
  ctx.strokeStyle = 'rgba(217, 119, 6, 0.14)'
  ctx.strokeRect(24, 24, 512 - 48, 256 - 48)

  // Subtle woven cross-hatch
  ctx.fillStyle = 'rgba(255, 255, 255, 0.018)'
  for (let x = 0; x < 512; x += 6) {
    ctx.fillRect(x, 0, 2, 256)
  }
  for (let y = 0; y < 256; y += 6) {
    ctx.fillRect(0, y, 512, 2)
  }
  return new THREE.CanvasTexture(c)
}

function makeSoftSpotPoolTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 126)
  g.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  g.addColorStop(0.28, 'rgba(255, 255, 255, 0.48)')
  g.addColorStop(0.62, 'rgba(255, 255, 255, 0.12)')
  g.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

function makeVolumetricConeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 128, 256)
  // After rotateX(PI/2), UV v=0 is at the wide floor end (y=256 in canvas) and v=1 is at the narrow lens apex (y=0 in canvas).
  // Use a smooth radial-like horizontal feather + vertical attenuation from lens to floor:
  const img = ctx.createImageData(128, 256)
  for (let y = 0; y < 256; y++) {
    // try both directions smoothly so the entire shaft has a soft core and fades at both extremes
    const t = y / 255
    const axial = Math.sin(Math.pow(t, 0.75) * Math.PI) * 0.9 + (1 - t) * 0.35
    for (let x = 0; x < 128; x++) {
      const u = Math.abs((x - 63.5) / 63.5)
      const radial = Math.pow(Math.max(0, 1 - u * 0.65), 1.4)
      const val = Math.min(255, Math.round(axial * radial * 235))
      const i = (y * 128 + x) * 4
      img.data[i] = val
      img.data[i + 1] = val
      img.data[i + 2] = val
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return new THREE.CanvasTexture(c)
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
  ctx.fillStyle = occupied ? 'rgba(12, 14, 20, 0.88)' : 'rgba(12, 14, 20, 0.54)'
  ctx.strokeStyle = occupied ? accentCss : 'rgba(148, 163, 184, 0.22)'
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

function buildStudioArchitecture(
  scene: THREE.Scene,
  disposables: THREE.Texture[],
) {
  const woodTex = makeWoodPlankTexture()
  const rugTex = makeRugTexture()
  disposables.push(woodTex, rugTex)

  // Realistic satin-varnished hardwood floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 18),
    new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.38,
      metalness: 0.08,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // Woven studio area rug under the ensemble
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(8.4, 4.2),
    new THREE.MeshStandardMaterial({
      map: rugTex,
      roughness: 0.9,
      metalness: 0.02,
    }),
  )
  rug.rotation.x = -Math.PI / 2
  rug.position.set(0, 0.006, -1.25)
  rug.receiveShadow = true
  scene.add(rug)

  // Back studio wall + side acoustic walls + dark baseboard
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x10131b,
    roughness: 0.82,
    metalness: 0.06,
  })
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(18, 7.5), wallMat)
  backWall.position.set(0, 3.75, -4.45)
  backWall.receiveShadow = true
  scene.add(backWall)

  const baseboard = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.18, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x080a0f, roughness: 0.5 }),
  )
  baseboard.position.set(0, 0.09, -4.4)
  scene.add(baseboard)

  for (const side of [-1, 1] as const) {
    const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(11, 7.5), wallMat)
    sideWall.position.set(side * 6.8, 3.75, -0.5)
    sideWall.rotation.y = -side * (Math.PI / 2.3)
    scene.add(sideWall)
  }

  // Acoustic timber-slat diffuser bays on left & right of the control-room window
  const slatWood = new THREE.MeshStandardMaterial({
    color: 0x6e472b,
    roughness: 0.42,
    metalness: 0.08,
  })
  const panelBacking = new THREE.MeshStandardMaterial({
    color: 0x080a0e,
    roughness: 0.95,
  })

  for (const px of [-4.15, 4.15]) {
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(2.45, 3.15, 0.07),
      panelBacking,
    )
    backing.position.set(px, 2.15, -4.38)
    scene.add(backing)

    for (let s = -9; s <= 9; s++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 3.0, 0.09),
        slatWood,
      )
      slat.position.set(px + s * 0.125, 2.15, -4.32)
      scene.add(slat)
    }
  }

  // Center Control-Room Observation Window + Mixing Console & Studio Monitors
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x171a24,
    roughness: 0.4,
    metalness: 0.5,
  })
  const windowFrame = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 2.15, 0.14),
    frameMat,
  )
  windowFrame.position.set(0, 2.32, -4.38)
  scene.add(windowFrame)

  // Warm interior control room backdrop behind glass
  const controlRoomBack = new THREE.Mesh(
    new THREE.PlaneGeometry(4.15, 1.92),
    new THREE.MeshStandardMaterial({
      color: 0x1d1926,
      emissive: 0x3b2516,
      emissiveIntensity: 0.55,
      roughness: 0.8,
    }),
  )
  controlRoomBack.position.set(0, 2.32, -4.3)
  scene.add(controlRoomBack)

  // Mixing desk silhouette + glowing VU meter bridge inside control room
  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.45, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 0.5 }),
  )
  desk.position.set(0, 1.58, -4.25)
  scene.add(desk)

  const vuColors = [0x34d399, 0x38bdf8, 0xfbbf24, 0x34d399, 0xa78bfa, 0xf87171]
  vuColors.forEach((hex, idx) => {
    const vu = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.07),
      new THREE.MeshBasicMaterial({ color: hex }),
    )
    vu.position.set(-0.85 + idx * 0.34, 1.76, -4.11)
    scene.add(vu)
  })

  // Angled acoustic studio glass pane
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(4.15, 1.92),
    new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.14,
      roughness: 0.08,
      metalness: 0.9,
    }),
  )
  glass.position.set(0, 2.32, -4.28)
  scene.add(glass)

  // Pair of large studio main monitors flanking the window
  for (const sx of [-2.55, 2.55]) {
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 1.45, 14),
      frameMat,
    )
    stand.position.set(sx, 0.72, -3.95)
    scene.add(stand)

    const monitorBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.58, 0.36),
      new THREE.MeshStandardMaterial({
        color: 0x12151f,
        roughness: 0.45,
        metalness: 0.3,
      }),
    )
    monitorBox.position.set(sx, 1.68, -3.95)
    monitorBox.rotation.y = sx < 0 ? 0.28 : -0.28
    scene.add(monitorBox)

    const woofer = new THREE.Mesh(
      new THREE.CircleGeometry(0.13, 24),
      new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.4,
        metalness: 0.3,
      }),
    )
    woofer.position.set(0, -0.08, 0.182)
    monitorBox.add(woofer)
  }

  // Overhead black-anodized lighting truss bar visible at top of frame
  const trussMat = new THREE.MeshStandardMaterial({
    color: 0x1e2230,
    metalness: 0.85,
    roughness: 0.25,
  })
  for (const ty of [3.26, 3.38]) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 8.8, 12),
      trussMat,
    )
    beam.rotation.z = Math.PI / 2
    beam.position.set(0, ty, -1.05)
    scene.add(beam)
  }

  // Warm recessed architectural cove strip along base of back wall
  const cove = new THREE.Mesh(
    new THREE.BoxGeometry(11.8, 0.022, 0.03),
    new THREE.MeshBasicMaterial({ color: 0xfde68a }),
  )
  cove.position.set(0, 0.2, -4.33)
  scene.add(cove)
}

export function createStudio(): Studio {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x090b10)
  scene.fog = new THREE.FogExp2(0x090b10, 0.042)

  const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 40)
  camera.position.set(0, 2.45, 4.65)
  camera.lookAt(0, 0.95, -1.35)

  const disposables: THREE.Texture[] = []

  // Balanced studio lighting: warm key with soft shadows + cool fill + control room glow
  const hemi = new THREE.HemisphereLight(0xffe8cc, 0x161b2e, 0.65)
  scene.add(hemi)

  const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.15)
  keyLight.position.set(2.8, 6.2, 4.2)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  keyLight.shadow.camera.near = 1
  keyLight.shadow.camera.far = 16
  keyLight.shadow.camera.left = -5.5
  keyLight.shadow.camera.right = 5.5
  keyLight.shadow.camera.top = 4
  keyLight.shadow.camera.bottom = -4
  keyLight.shadow.bias = -0.0008
  scene.add(keyLight)

  const warmWash = new THREE.PointLight(0xf59e0b, 1.8, 12)
  warmWash.position.set(0, 2.5, -3.8)
  scene.add(warmWash)

  buildStudioArchitecture(scene, disposables)

  // Realistic overhead moving-head spotlights with soft radial floor pools & feathered volumetric haze
  const poolTex = makeSoftSpotPoolTexture()
  const coneTex = makeVolumetricConeTexture()
  disposables.push(poolTex, coneTex)

  const SPOT_CONFIGS = [
    {
      x: -2.45,
      z: -1.05,
      color: 0x38bdf8,
      baseTargetX: -2.35,
      baseTargetZ: -1.15,
      speed: 0.62,
      phase: 0,
    },
    {
      x: 0,
      z: -1.05,
      color: 0xc084fc,
      baseTargetX: 0,
      baseTargetZ: -1.5,
      speed: 0.5,
      phase: 2.1,
    },
    {
      x: 2.45,
      z: -1.05,
      color: 0xf59e0b,
      baseTargetX: 2.35,
      baseTargetZ: -1.15,
      speed: 0.58,
      phase: 4.2,
    },
  ]

  const coneGeo = new THREE.CylinderGeometry(0.07, 1.15, 1, 36, 1, true)
  coneGeo.translate(0, -0.5, 0)
  coneGeo.rotateX(-Math.PI / 2)

  const fixtureHousingMat = new THREE.MeshStandardMaterial({
    color: 0x141720,
    metalness: 0.78,
    roughness: 0.28,
  })

  const movingSpots = SPOT_CONFIGS.map((cfg) => {
    const origin = new THREE.Vector3(cfg.x, 3.18, cfg.z)

    // Physical moving-head spotlight housing + glowing lens flare
    const headGroup = new THREE.Group()
    headGroup.position.copy(origin)
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.095, 0.24, 18),
      fixtureHousingMat,
    )
    can.rotation.x = Math.PI / 2
    headGroup.add(can)

    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.072, 18),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    )
    lens.position.z = 0.122
    headGroup.add(lens)

    const flare = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: poolTex,
        color: cfg.color,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    flare.scale.set(0.55, 0.55, 1)
    flare.position.z = 0.13
    headGroup.add(flare)
    scene.add(headGroup)

    // Real Three.js SpotLight illuminating the instruments, musicians, and floor
    const spot = new THREE.SpotLight(
      cfg.color,
      18,
      13,
      Math.PI / 5.2,
      0.82,
      1.35,
    )
    spot.position.copy(origin)
    spot.target.position.set(cfg.baseTargetX, 0.02, cfg.baseTargetZ)
    scene.add(spot, spot.target)

    // Soft-feathered volumetric haze cone
    const beamMat = new THREE.MeshBasicMaterial({
      color: cfg.color,
      alphaMap: coneTex,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const beam = new THREE.Mesh(coneGeo, beamMat)
    beam.position.copy(origin)
    scene.add(beam)

    // Soft radial-gradient light pool on the floor (no sharp edge)
    const poolMat = new THREE.MeshBasicMaterial({
      color: cfg.color,
      map: poolTex,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), poolMat)
    pool.rotation.x = -Math.PI / 2
    pool.position.set(cfg.baseTargetX, 0.012, cfg.baseTargetZ)
    scene.add(pool)

    return { cfg, origin, headGroup, spot, beam, beamMat, pool, poolMat }
  })

  const stations: StudioStation[] = STATION_CONFIGS.map((cfg) => {
    const root = new THREE.Group()
    root.position.set(cfg.x, 0, cfg.z)
    root.rotation.y = cfg.rotY
    scene.add(root)

    // Low-profile carpeted instrument riser
    const riser = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.24, 0.07, 48),
      new THREE.MeshStandardMaterial({
        color: 0x151822,
        roughness: 0.72,
        metalness: 0.18,
      }),
    )
    riser.position.y = 0.035
    riser.receiveShadow = true
    riser.castShadow = true
    root.add(riser)

    const riserRimMat = new THREE.MeshStandardMaterial({
      color: cfg.accentHex,
      emissive: cfg.accentHex,
      emissiveIntensity: 0.25,
      roughness: 0.35,
      metalness: 0.5,
    })
    const riserRim = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.014, 12, 56),
      riserRimMat,
    )
    riserRim.rotation.x = Math.PI / 2
    riserRim.position.y = 0.072
    root.add(riserRim)

    const model = buildStationModel(cfg.instrument)
    model.root.position.y = 0.07
    model.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })
    root.add(model.root)

    const slots: StationSlot[] = AVATAR_OFFSETS.map((off) => {
      const musician = buildStylizedMusician()
      musician.root.position.set(off.x, 0.07, off.z)
      musician.root.visible = false
      musician.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true
          obj.receiveShadow = true
        }
      })
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
      movingSpots.forEach((ms, idx) => {
        const { cfg } = ms
        const stPulse = stations[idx]?.stationPulse ?? 0
        const tx =
          cfg.baseTargetX +
          Math.sin(t * cfg.speed + cfg.phase) * 1.1 +
          Math.cos(t * cfg.speed * 0.45 + idx) * 0.32
        const tz =
          cfg.baseTargetZ +
          Math.cos(t * cfg.speed * 0.8 + cfg.phase) * 0.6

        ms.spot.target.position.set(tx, 0.02, tz)
        ms.spot.intensity = 16 + stPulse * 14

        ms.headGroup.lookAt(ms.spot.target.position)

        ms.pool.position.set(tx, 0.012, tz)
        const poolScale = 1 + Math.sin(t * 1.8 + idx) * 0.06 + stPulse * 0.25
        ms.pool.scale.set(poolScale, poolScale, 1)
        ms.poolMat.opacity = 0.36 + stPulse * 0.32

        const dist = ms.origin.distanceTo(ms.spot.target.position)
        ms.beam.scale.set(1, 1, dist)
        ms.beam.lookAt(ms.spot.target.position)
        ms.beamMat.opacity = 0.28 + stPulse * 0.22
      })

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
      for (const tex of disposables) tex.dispose()
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
