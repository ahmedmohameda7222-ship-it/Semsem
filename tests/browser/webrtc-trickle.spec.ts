import { expect, test } from '@playwright/test'

test('real Chromium WebRTC connects while candidates arrive after SDP exchange', async ({ page }) => {
  await page.goto('/welcome')
  const results = await page.evaluate(async () => {
    const caller = new RTCPeerConnection({ iceServers: [] })
    const receiver = new RTCPeerConnection({ iceServers: [] })
    const channel = caller.createDataChannel('network')
    const awaitingCaller: RTCIceCandidateInit[] = []
    const awaitingReceiver: RTCIceCandidateInit[] = []
    let exchanged = 0
    const start = performance.now()
    caller.onicecandidate = (event) => {
      if (!event.candidate) return
      exchanged++
      const candidate = event.candidate.toJSON()
      if (receiver.remoteDescription)
        void receiver.addIceCandidate(candidate).catch(() => {})
      else awaitingReceiver.push(candidate)
    }
    receiver.onicecandidate = (event) => {
      if (!event.candidate) return
      exchanged++
      const candidate = event.candidate.toJSON()
      if (caller.remoteDescription)
        void caller.addIceCandidate(candidate).catch(() => {})
      else awaitingCaller.push(candidate)
    }
    try {
      const incoming = new Promise<string>((resolve) => {
        receiver.ondatachannel = (event) => {
          event.channel.onmessage = (message) => resolve(String(message.data))
        }
      })
      const offer = await caller.createOffer()
      await caller.setLocalDescription(offer)
      await receiver.setRemoteDescription(offer)
      const answer = await receiver.createAnswer()
      await receiver.setLocalDescription(answer)
      await caller.setRemoteDescription(answer)
      const signalingMs = performance.now() - start
      for (const candidate of awaitingReceiver)
        await receiver.addIceCandidate(candidate)
      for (const candidate of awaitingCaller)
        await caller.addIceCandidate(candidate)
      await Promise.race([
        new Promise<void>((resolve) => {
          if (channel.readyState === 'open') return resolve()
          channel.addEventListener('open', () => resolve(), { once: true })
        }),
        new Promise<never>((_, reject) => setTimeout(
          () => reject(new Error('Trickle ICE browser connection timeout')),
          10000,
        )),
      ])
      channel.send('connected')
      const message = await Promise.race([
        incoming,
        new Promise<never>((_, reject) => setTimeout(
          () => reject(new Error('No response on remote WebRTC channel')),
          3000,
        )),
      ])
      return { signalingMs, exchanged, message }
    } finally {
      channel.close()
      caller.close()
      receiver.close()
    }
  })
  expect(results.message).toBe('connected')
  expect(results.exchanged).toBeGreaterThan(0)
  expect(results.signalingMs).toBeLessThan(3000)
})
