/**
 * speakText — plays text via OpenAI TTS.
 *
 * Strategy:
 *   1. Fetch audio from /api/speak (OpenAI TTS).
 *   2. Play via Web Audio API.
 *   3. If fetch fails, fall back to browser SpeechSynthesis.
 *
 * stopSpeaking() — cancels all active audio immediately.
 */

let currentSource: AudioBufferSourceNode | null = null
let currentAudioCtx: AudioContext | null = null

export function stopSpeaking(): void {
  if (typeof window !== 'undefined') {
    window.speechSynthesis.cancel()
  }
  if (currentSource) {
    try { currentSource.stop() } catch { /* already stopped */ }
    currentSource = null
  }
  if (currentAudioCtx) {
    try { currentAudioCtx.close() } catch { /* ignore */ }
    currentAudioCtx = null
  }
}

export async function speakText(text: string): Promise<void> {
  if (!text || typeof window === 'undefined') return

  try {
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!res.ok) throw new Error(`speak API ${res.status}`)

    const arrayBuffer = await res.arrayBuffer()
    const audioCtx = new AudioContext()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    const source = audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioCtx.destination)

    currentAudioCtx = audioCtx
    currentSource = source

    source.start(0)

    return new Promise((resolve) => {
      source.onended = () => {
        currentSource = null
        currentAudioCtx = null
        resolve()
      }
    })
  } catch {
    // Fallback to browser TTS
    window.speechSynthesis.cancel()
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.95
      utterance.pitch = 1
      utterance.volume = 1
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      window.speechSynthesis.speak(utterance)
    })
  }
}
