import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { io } from 'socket.io-client'

const PORT = 3199
const URL = `http://localhost:${PORT}`

const server = spawn('npx', ['tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
})
server.stdout.on('data', () => {})

let failures = 0
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
  if (!cond) failures++
}
const waitFor = (fn, ms = 3000) =>
  new Promise((res, rej) => {
    const t0 = Date.now()
    const poll = () => {
      if (fn()) return res(true)
      if (Date.now() - t0 > ms) return rej(new Error('timeout'))
      setTimeout(poll, 25)
    }
    poll()
  })

try {
  await waitFor(async () => {
    try {
      const r = await fetch(`${URL}/health`)
      return r.ok
    } catch {
      return false
    }
  })
  console.log('server up')

  const a = io(URL, { transports: ['websocket'] })
  const b = io(URL, { transports: ['websocket'] })
  const c = io(URL, { transports: ['websocket'] })
  await Promise.all([
    new Promise((r) => a.once('connect', r)),
    new Promise((r) => b.once('connect', r)),
    new Promise((r) => c.once('connect', r)),
  ])

  const hitsA = []
  const hitsB = []
  const hitsC = []
  a.on('drum-hit', (h) => hitsA.push(h))
  b.on('drum-hit', (h) => hitsB.push(h))
  c.on('drum-hit', (h) => hitsC.push(h))

  const joinResA = await a.timeout(3000).emitWithAck('join', {})
  check('A creates room', joinResA.ok && joinResA.roomId?.length === 4)
  const code = joinResA.roomId
  const playerA = joinResA.you.id

  const joinResB = await b.timeout(3000).emitWithAck('join', { roomId: code })
  check('B joins room', joinResB.ok && joinResB.roomId === code)

  const badJoin = await c
    .timeout(3000)
    .emitWithAck('join', { roomId: 'ZZZZ' })
  check('C rejected from missing room', !badJoin.ok)

  const joinResC = await c.timeout(3000).emitWithAck('join', {})
  const code2 = joinResC.roomId
  check('C gets different room', joinResC.ok && code2 !== code)

  a.emit('hit', { roomId: code, playerId: playerA, drum: 'kick', velocity: 0.8, ts: 111 })
  await delay(400)
  check('B received A\'s hit', hitsB.length === 1 && hitsB[0].drum === 'kick' && hitsB[0].velocity === 0.8)
  check('sender gets no echo', hitsA.length === 0)
  check('other room isolated', hitsC.length === 0)

  b.emit('hit', { roomId: code, playerId: 'spoofed', drum: 'snare', velocity: 2, ts: 222 })
  await delay(400)
  check('spoofed playerId rejected', hitsA.length === 0)

  a.emit('hit', { roomId: code, playerId: playerA, drum: 'laser', velocity: 1, ts: 333 })
  await delay(300)
  check('invalid drum rejected', hitsB.length === 1)

  a.emit('hit', { roomId: code, playerId: playerA, drum: 'hihat', velocity: 99, ts: 444 })
  await delay(300)
  check('velocity clamped to 1', hitsB.length === 2 && hitsB[1].velocity === 1)

  a.emit('hit', { roomId: code, playerId: playerA, drum: 'kick', velocity: 1, ts: 555 })
  a.emit('hit', { roomId: code, playerId: playerA, drum: 'kick', velocity: 1, ts: 556 })
  await delay(300)
  check('rate limit drops burst duplicate', hitsB.length === 3)

  const cursorsA = []
  const cursorsB = []
  const cursorsC = []
  a.on('remote-cursor', (cur) => cursorsA.push(cur))
  b.on('remote-cursor', (cur) => cursorsB.push(cur))
  c.on('remote-cursor', (cur) => cursorsC.push(cur))
  a.emit('cursor', { roomId: code, playerId: playerA, hands: [{ x: 0.3, y: 0.7 }], ts: 1 })
  await delay(300)
  check('cursor relayed to room', cursorsB.length === 1 && cursorsB[0].hands[0].x === 0.3)
  check('cursor isolated to room', cursorsC.length === 0)
  check('cursor sender no echo', cursorsA.length === 0)

  a.emit('cursor', { roomId: code, playerId: playerA, hands: 'bogus', ts: 2 })
  await delay(300)
  check('malformed cursor rejected', cursorsB.length === 1)

  let latestState = null
  a.on('room-state', (s) => (latestState = s))
  b.emit('leave')
  await delay(300)
  check('B leave updates room-state', latestState?.players?.length === 1)

  a.emit('leave')
  await delay(200)
  const rejoin = await a.timeout(3000).emitWithAck('join', { roomId: code })
  check('empty room GC\'d', !rejoin.ok)

  a.disconnect()
  b.disconnect()
  c.disconnect()
} catch (e) {
  console.log('FATAL', e.message)
  failures++
} finally {
  server.kill()
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
