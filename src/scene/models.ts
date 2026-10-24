import * as THREE from 'three'
import {
  GUITAR_NOTES,
  PIANO_NOTES,
  type InstrumentId,
} from '../audio/instruments'

export interface AnimatablePart {
  mesh: THREE.Object3D
  mat: THREE.MeshStandardMaterial
  baseY: number
  baseRotX: number
}

export interface StationModel {
  root: THREE.Group
  parts: Map<string, AnimatablePart>
  accentLight: THREE.PointLight
}

export interface MusicianModel {
  root: THREE.Group
  jacketMat: THREE.MeshStandardMaterial
  accentMat: THREE.MeshStandardMaterial
  leftArm: THREE.Group
  rightArm: THREE.Group
  head: THREE.Group
}

const chromeMat = () =>
  new THREE.MeshStandardMaterial({
    color: 0xd4d8e2,
    metalness: 0.88,
    roughness: 0.18,
  })

const darkMetalMat = () =>
  new THREE.MeshStandardMaterial({
    color: 0x1c1f28,
    metalness: 0.7,
    roughness: 0.35,
  })

export function buildDrumKitModel(): StationModel {
  const root = new THREE.Group()
  const parts = new Map<string, AnimatablePart>()
  const hw = chromeMat()
  const dark = darkMetalMat()

  const shellMat = (emissiveHex: number) =>
    new THREE.MeshStandardMaterial({
      color: 0x3b1728,
      roughness: 0.28,
      metalness: 0.35,
      emissive: emissiveHex,
      emissiveIntensity: 0.12,
    })

  const headMat = (emissiveHex: number) =>
    new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.45,
      metalness: 0.05,
      emissive: emissiveHex,
      emissiveIntensity: 0.15,
    })

  // Bass drum (horizontal cylinder facing audience)
  const kickGroup = new THREE.Group()
  kickGroup.position.set(0, 0.44, 0.22)
  const kickShellMat = shellMat(0xc084fc)
  const kickShell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 0.46, 36),
    kickShellMat,
  )
  kickShell.rotation.x = Math.PI / 2
  kickGroup.add(kickShell)

  const kickFront = new THREE.Mesh(
    new THREE.CircleGeometry(0.365, 36),
    new THREE.MeshStandardMaterial({
      color: 0x14161d,
      roughness: 0.4,
      emissive: 0xc084fc,
      emissiveIntensity: 0.18,
    }),
  )
  kickFront.position.z = 0.232
  kickGroup.add(kickFront)

  const hoopGeo = new THREE.TorusGeometry(0.38, 0.018, 12, 36)
  for (const z of [-0.23, 0.23]) {
    const hoop = new THREE.Mesh(hoopGeo, hw)
    hoop.position.z = z
    kickGroup.add(hoop)
  }
  root.add(kickGroup)
  parts.set('kick', {
    mesh: kickGroup,
    mat: kickShellMat,
    baseY: 0.44,
    baseRotX: 0,
  })

  // Rack tom mounted above kick
  const rackTom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.18, 28),
    shellMat(0x818cf8),
  )
  rackTom.position.set(-0.16, 0.88, 0.16)
  rackTom.rotation.x = 0.22
  root.add(rackTom)

  // Floor tom (right of player, left from audience)
  const floorTom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.38, 28),
    shellMat(0x818cf8),
  )
  floorTom.position.set(0.48, 0.46, 0.04)
  root.add(floorTom)

  // Snare drum on stand
  const snareGroup = new THREE.Group()
  snareGroup.position.set(-0.44, 0.68, 0.12)
  const snareMat = headMat(0x67e8f9)
  const snareBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.14, 32),
    snareMat,
  )
  const snareRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.014, 10, 32),
    hw,
  )
  snareRim.rotation.x = Math.PI / 2
  snareRim.position.y = 0.07
  snareGroup.add(snareBody, snareRim)
  root.add(snareGroup)

  const snareStand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, 0.65, 12),
    hw,
  )
  snareStand.position.set(-0.44, 0.33, 0.12)
  root.add(snareStand)
  parts.set('snare', {
    mesh: snareGroup,
    mat: snareMat,
    baseY: 0.68,
    baseRotX: 0,
  })

  // Hi-hat + crash cymbals (brass)
  const hihatGroup = new THREE.Group()
  hihatGroup.position.set(-0.66, 0.94, 0.22)
  const cymbalMat = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    metalness: 0.85,
    roughness: 0.22,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.16,
  })
  const topHat = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.035, 32),
    cymbalMat,
  )
  const botHat = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.03, 32),
    cymbalMat,
  )
  botHat.rotation.x = Math.PI
  botHat.position.y = -0.025
  hihatGroup.add(topHat, botHat)
  root.add(hihatGroup)

  const hhStand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.018, 0.96, 12),
    hw,
  )
  hhStand.position.set(-0.66, 0.48, 0.22)
  root.add(hhStand)

  // Ride/crash cymbal on right boom stand
  const crash = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.04, 32),
    cymbalMat,
  )
  crash.position.set(0.58, 1.12, 0.24)
  crash.rotation.z = -0.18
  crash.rotation.x = 0.15
  root.add(crash)
  const crashStand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.018, 1.12, 12),
    hw,
  )
  crashStand.position.set(0.58, 0.56, 0.24)
  root.add(crashStand)

  parts.set('hihat', {
    mesh: hihatGroup,
    mat: cymbalMat,
    baseY: 0.94,
    baseRotX: 0,
  })

  // Drum throne
  const seat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.08, 24),
    dark,
  )
  seat.position.set(0, 0.52, -0.34)
  const thronePost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.03, 0.5, 12),
    hw,
  )
  thronePost.position.set(0, 0.25, -0.34)
  root.add(seat, thronePost)

  const accentLight = new THREE.PointLight(0x67e8f9, 1.2, 4.5)
  accentLight.position.set(0, 1.6, 0.4)
  root.add(accentLight)

  return { root, parts, accentLight }
}

export function buildGrandPianoModel(): StationModel {
  const root = new THREE.Group()
  const parts = new Map<string, AnimatablePart>()
  const hw = chromeMat()

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x12131a,
    roughness: 0.18,
    metalness: 0.45,
  })
  const woodTrimMat = new THREE.MeshStandardMaterial({
    color: 0x5c3a24,
    roughness: 0.42,
    metalness: 0.1,
  })

  // Main keyboard cabinet
  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(1.58, 0.16, 0.48),
    bodyMat,
  )
  cabinet.position.set(0, 0.78, 0.24)
  root.add(cabinet)

  // Walnut cheek blocks
  for (const x of [-0.77, 0.77]) {
    const cheek = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.19, 0.5),
      woodTrimMat,
    )
    cheek.position.set(x, 0.79, 0.24)
    root.add(cheek)
  }

  // Music rest / angled control deck
  const musicRest = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.24, 0.02),
    bodyMat,
  )
  musicRest.position.set(0, 0.96, 0.34)
  musicRest.rotation.x = -0.28
  root.add(musicRest)

  // Architectural steel legs + pedal lyre
  for (const x of [-0.68, 0.68]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.74, 0.38),
      bodyMat,
    )
    leg.position.set(x, 0.37, 0.24)
    root.add(leg)
  }
  const pedalBar = new THREE.Mesh(
    new THREE.BoxGeometry(1.32, 0.04, 0.06),
    hw,
  )
  pedalBar.position.set(0, 0.06, 0.28)
  root.add(pedalBar)

  // 8 visible playable white keys + 5 black sharps
  const keySpan = 1.32
  const keyW = keySpan / PIANO_NOTES.length
  PIANO_NOTES.forEach((note, idx) => {
    const x = -keySpan / 2 + keyW * (idx + 0.5)
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.25,
      metalness: 0.05,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.06,
    })
    const keyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(keyW * 0.88, 0.045, 0.24),
      mat,
    )
    keyMesh.position.set(x, 0.865, 0.14)
    root.add(keyMesh)
    parts.set(note, {
      mesh: keyMesh,
      mat,
      baseY: 0.865,
      baseRotX: 0,
    })
  })

  const sharpOffsets = [0, 1, 3, 4, 5]
  for (const i of sharpOffsets) {
    const x = -keySpan / 2 + keyW * (i + 1)
    const sharp = new THREE.Mesh(
      new THREE.BoxGeometry(keyW * 0.52, 0.055, 0.15),
      bodyMat,
    )
    sharp.position.set(x, 0.885, 0.18)
    root.add(sharp)
  }

  // Upholstered piano bench
  const benchTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.07, 0.34),
    darkMetalMat(),
  )
  benchTop.position.set(0, 0.5, -0.34)
  root.add(benchTop)
  for (const [lx, lz] of [
    [-0.32, -0.46],
    [0.32, -0.46],
    [-0.32, -0.22],
    [0.32, -0.22],
  ]) {
    const bLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.016, 0.48, 10),
      bodyMat,
    )
    bLeg.position.set(lx, 0.24, lz)
    root.add(bLeg)
  }

  const accentLight = new THREE.PointLight(0x38bdf8, 1.2, 4.5)
  accentLight.position.set(0, 1.65, 0.35)
  root.add(accentLight)

  return { root, parts, accentLight }
}

export function buildGuitarRigModel(): StationModel {
  const root = new THREE.Group()
  const parts = new Map<string, AnimatablePart>()
  const hw = chromeMat()
  const cabMat = new THREE.MeshStandardMaterial({
    color: 0x161821,
    roughness: 0.72,
    metalness: 0.15,
  })
  const grilleMat = new THREE.MeshStandardMaterial({
    color: 0x262936,
    roughness: 0.85,
    metalness: 0.25,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.08,
  })

  // 4x12 Speaker cabinet (behind/side of guitarist)
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.86, 0.38),
    cabMat,
  )
  cab.position.set(0.42, 0.43, -0.08)
  cab.rotation.y = -0.25
  root.add(cab)

  const grille = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.74),
    grilleMat,
  )
  grille.position.set(0.37, 0.43, 0.11)
  grille.rotation.y = -0.25
  root.add(grille)

  // Tube amp head on top of cabinet
  const ampHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.74, 0.26, 0.32),
    cabMat,
  )
  ampHead.position.set(0.42, 0.99, -0.08)
  ampHead.rotation.y = -0.25
  root.add(ampHead)

  const ampPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.09),
    new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.75,
      roughness: 0.25,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.35,
    }),
  )
  ampPanel.position.set(0.38, 0.98, 0.08)
  ampPanel.rotation.y = -0.25
  root.add(ampPanel)

  // Electric Guitar (held/mounted in playing position)
  const guitarGroup = new THREE.Group()
  guitarGroup.position.set(-0.08, 0.92, 0.18)
  guitarGroup.rotation.z = 0.28
  guitarGroup.rotation.y = 0.12

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    roughness: 0.2,
    metalness: 0.45,
    emissive: 0xf97316,
    emissiveIntensity: 0.18,
  })

  const lowerBout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.055, 28),
    bodyMat,
  )
  lowerBout.rotation.x = Math.PI / 2
  lowerBout.position.set(-0.08, -0.04, 0)
  guitarGroup.add(lowerBout)

  const upperBout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.055, 24),
    bodyMat,
  )
  upperBout.rotation.x = Math.PI / 2
  upperBout.position.set(0.08, 0.05, 0)
  guitarGroup.add(upperBout)

  const pickguard = new THREE.Mesh(
    new THREE.CircleGeometry(0.13, 24),
    new THREE.MeshStandardMaterial({ color: 0xf5f5f4, roughness: 0.35 }),
  )
  pickguard.position.set(-0.04, -0.02, 0.03)
  guitarGroup.add(pickguard)

  const neck = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.055, 0.028),
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5 }),
  )
  neck.position.set(0.38, 0.14, 0)
  neck.rotation.z = 0.22
  guitarGroup.add(neck)

  const headstock = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.075, 0.024),
    bodyMat,
  )
  headstock.position.set(0.72, 0.22, 0)
  headstock.rotation.z = 0.22
  guitarGroup.add(headstock)

  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.09, 0.02),
    hw,
  )
  bridge.position.set(-0.14, -0.04, 0.032)
  guitarGroup.add(bridge)

  root.add(guitarGroup)

  for (const note of GUITAR_NOTES) {
    parts.set(note, {
      mesh: guitarGroup,
      mat: bodyMat,
      baseY: 0.92,
      baseRotX: 0,
    })
  }

  // Floor pedalboard
  const pedalboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.04, 0.22),
    darkMetalMat(),
  )
  pedalboard.position.set(-0.22, 0.03, 0.42)
  pedalboard.rotation.x = 0.15
  root.add(pedalboard)

  const accentLight = new THREE.PointLight(0xf59e0b, 1.2, 4.5)
  accentLight.position.set(0, 1.65, 0.35)
  root.add(accentLight)

  return { root, parts, accentLight }
}

export function buildStationModel(instrument: InstrumentId): StationModel {
  if (instrument === 'piano') return buildGrandPianoModel()
  if (instrument === 'guitar') return buildGuitarRigModel()
  return buildDrumKitModel()
}

export function buildStylizedMusician(): MusicianModel {
  const root = new THREE.Group()

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd6b49c,
    roughness: 0.55,
    metalness: 0.05,
  })
  const jacketMat = new THREE.MeshStandardMaterial({
    color: 0x272a3a,
    roughness: 0.48,
    metalness: 0.15,
    emissive: 0x6366f1,
    emissiveIntensity: 0.15,
  })
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xa78bfa,
    roughness: 0.3,
    metalness: 0.5,
    emissive: 0xa78bfa,
    emissiveIntensity: 0.4,
  })
  const darkHairMat = new THREE.MeshStandardMaterial({
    color: 0x171923,
    roughness: 0.65,
  })

  // Torso (tailored studio jacket + inner tee)
  const chest = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.18, 0.36, 10, 18),
    jacketMat,
  )
  chest.scale.set(1.18, 1, 0.78)
  chest.position.y = 0.92
  root.add(chest)

  const shoulders = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.095, 0.34, 8, 14),
    jacketMat,
  )
  shoulders.rotation.z = Math.PI / 2
  shoulders.position.set(0, 1.14, 0)
  root.add(shoulders)

  const collarBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.018, 10, 24),
    accentMat,
  )
  collarBand.rotation.x = Math.PI / 2
  collarBand.position.set(0, 1.19, 0.02)
  root.add(collarBand)

  // Head + studio monitor headphones
  const head = new THREE.Group()
  head.position.set(0, 1.38, 0.02)

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.065, 0.1, 14),
    skinMat,
  )
  neck.position.y = -0.14
  head.add(neck)

  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.145, 24, 20),
    skinMat,
  )
  skull.scale.set(0.94, 1.06, 0.98)
  head.add(skull)

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.152, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
    darkHairMat,
  )
  hair.position.y = 0.02
  hair.rotation.x = -0.18
  head.add(hair)

  // Studio over-ear headphones
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.155, 0.014, 10, 28, Math.PI),
    darkHairMat,
  )
  band.position.y = 0.02
  head.add(band)

  for (const sx of [-0.152, 0.152]) {
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.036, 18),
      accentMat,
    )
    cup.rotation.z = Math.PI / 2
    cup.position.set(sx, 0, 0.01)
    head.add(cup)
  }

  root.add(head)

  // Articulated left & right arms posed forward toward the instrument
  const makeArm = (side: -1 | 1) => {
    const arm = new THREE.Group()
    arm.position.set(side * 0.23, 1.12, 0)
    const upper = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.052, 0.22, 8, 12),
      jacketMat,
    )
    upper.position.set(side * 0.02, -0.12, 0.08)
    upper.rotation.x = -0.55
    upper.rotation.z = side * -0.12
    arm.add(upper)

    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.044, 0.2, 8, 12),
      skinMat,
    )
    forearm.position.set(side * -0.02, -0.22, 0.24)
    forearm.rotation.x = -1.18
    forearm.rotation.z = side * 0.18
    arm.add(forearm)
    return arm
  }

  const leftArm = makeArm(-1)
  const rightArm = makeArm(1)
  root.add(leftArm, rightArm)

  return { root, jacketMat, accentMat, leftArm, rightArm, head }
}
