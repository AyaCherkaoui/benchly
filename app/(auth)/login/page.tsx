'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowUpRight, Mail, Lock, Check } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'

function playSound(freq: number, duration: number, volume = 0.03) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = freq; osc.type = 'sine'
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(); osc.stop(ctx.currentTime + duration)
  } catch { /* ignore */ }
}

const benefits = [
  { k: 'Hands-free voice capture', d: 'Log samples & protocols mid-pipette.' },
  { k: 'Zero context switching', d: 'No tabs, no typing, no broken flow.' },
  { k: 'Auto-validated entries', d: 'Catches mismatched units & IDs in real time.' },
]

interface FieldProps {
  icon: React.ReactNode
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  delay?: number
}

function Field({ icon, label, type, value, onChange, placeholder, delay = 0 }: FieldProps) {
  const [focused, setFocused] = useState(false)
  return (
    <motion.label
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      style={{ display: 'block', cursor: 'text' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: focused ? '#e8a598' : '#555', transition: 'color 0.2s', display: 'flex', alignItems: 'center' }}>
          {icon}
        </span>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.22em', color: focused ? '#f0f0f0' : '#555', transition: 'color 0.2s', fontFamily: 'monospace' }}>
          {label}
        </span>
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { setFocused(true); playSound(800, 0.08, 0.02) }}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        required
        style={{
          width: '100%',
          height: 44,
          background: 'transparent',
          border: 'none',
          borderBottom: `1px solid ${focused ? '#e8a598' : 'rgba(255,255,255,0.12)'}`,
          borderRadius: 0,
          padding: '0 0 10px',
          fontSize: 14,
          color: '#f0f0f0',
          outline: 'none',
          transition: 'border-color 200ms ease',
          boxSizing: 'border-box',
        }}
      />
    </motion.label>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      playSound(200, 0.3, 0.04)
      setError(error.message)
      setLoading(false)
      return
    }
    playSound(880, 0.1); setTimeout(() => playSound(1100, 0.15), 100)
    router.push('/dashboard')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#080808', position: 'relative', overflow: 'hidden' }}>

      {/* Light leak — fixed, top-left only */}
      <div style={{ pointerEvents: 'none', position: 'fixed', top: 0, left: 0, width: 600, height: 600, background: 'conic-gradient(from 198deg at -8% -8%, rgba(232,165,152,0.25) 0deg, transparent 40deg)', zIndex: 0 }} />
      <div style={{ pointerEvents: 'none', position: 'fixed', top: -60, left: -60, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,165,152,0.20) 0%, transparent 70%)', zIndex: 0 }} />

      {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex"
        style={{
          width: '44%',
          minWidth: 0,
          background: '#080808',
          position: 'sticky',
          top: 0,
          height: '100vh',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingTop: 0,
          paddingBottom: 48,
          paddingLeft: 64,
          paddingRight: 64,
          overflowY: 'auto',
          zIndex: 1,
        }}
      >
        {/* Logo: marginTop 48, marginBottom 64 */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 0, marginBottom: 48, textDecoration: 'none' }}>
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#f0f0f0', fontWeight: 400 }}>Benchly</span>
        </Link>

        {/* Lab Co-pilot section removed entirely */}

        <motion.h1
          initial={{ opacity: 0, y: 44 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(56px, 5.5vw, 96px)', lineHeight: 0.92, letterSpacing: '-0.025em', margin: 0, color: '#f0f0f0' }}
        >
          A quieter way<br />
          <span style={{ color: '#e8a598', fontStyle: 'italic' }}>to run the bench.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ marginTop: 28, fontSize: 15, lineHeight: 1.7, maxWidth: 400, color: 'rgba(255,255,255,0.45)' }}
        >
          Benchly is an <span style={{ color: '#f0f0f0' }}>AI lab assistant</span> that listens continuously,
          validates every entry against your protocols, and auto-logs samples the moment you speak them.
        </motion.p>

        <ul style={{ display: 'flex', flexDirection: 'column', gap: 20, listStyle: 'none', padding: 0, margin: '40px 0 0' }}>
          {benefits.map((b, i) => (
            <motion.li
              key={b.k}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.55 + i * 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}
            >
              <span style={{ marginTop: 2, height: 20, width: 20, borderRadius: '50%', border: '1px solid rgba(232,165,152,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Check style={{ height: 10, width: 10, color: '#e8a598' }} strokeWidth={3} />
              </span>
              <div>
                <p style={{ fontSize: 13, color: '#f0f0f0', margin: 0 }}>{b.k}</p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', margin: '3px 0 0' }}>{b.d}</p>
              </div>
            </motion.li>
          ))}
        </ul>

        <div style={{ marginTop: 52, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ height: 6, width: 6, borderRadius: '50%', background: '#e8a598', display: 'inline-block' }} />
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.24em', color: '#555', fontFamily: 'monospace' }}>
            Trusted by 240+ labs · SOC2 in progress
          </span>
        </div>

        {/* Gradient divider replaces borderRight */}
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.08) 70%, transparent)' }} />
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          background: '#0f0f0f',
          paddingLeft: 60,
          paddingRight: 60,
          zIndex: 1,
          position: 'relative',
        }}
      >
        {/* Mobile header */}
        <div className="flex lg:hidden" style={{ position: 'absolute', top: 24, left: 24, alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 16, color: '#f0f0f0' }}>Benchly</span>
        </div>

        {/* Inner centering wrapper */}
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingBottom: 140 }}>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: '100%', maxWidth: 500, position: 'relative' }}
          >
            {/* Static card — rotating gradient border removed */}
            <div style={{ background: '#111111', borderRadius: 13, padding: '36px 36px 40px' }}>

              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 32, color: '#f0f0f0', margin: 0, fontWeight: 400 }}>
                Welcome back
              </h2>
              <p style={{ fontSize: 13, color: '#555', marginTop: 8, marginBottom: 0 }}>
                Sign in to your Benchly account.
              </p>

              <form onSubmit={handleLogin} style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 22 }}>
                <Field icon={<Mail style={{ height: 14, width: 14 }} />} label="Work email" type="email" value={email} onChange={setEmail} placeholder="ada@yourlab.org" delay={0.2} />
                <Field icon={<Lock style={{ height: 14, width: 14 }} />} label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" delay={0.28} />

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -8 }}>
                  <Link href="/forgot-password" style={{ fontSize: 12, color: '#555', textDecoration: 'underline', textUnderlineOffset: 4 }}>
                    Forgot password?
                  </Link>
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ fontSize: 13, color: '#f87171', background: 'rgba(248,113,113,0.08)', padding: '10px 14px', borderRadius: 8, margin: 0 }}
                  >
                    {error}
                  </motion.p>
                )}

                {/* Submit with shimmer sweep */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover="hovered"
                    initial="rest"
                    whileTap={{ scale: 0.98 }}
                    style={{
                      position: 'relative', overflow: 'hidden',
                      width: '100%', height: 48, borderRadius: 8,
                      background: '#e8a598', border: 'none', color: '#0a0a0a',
                      fontFamily: 'monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.24em',
                      cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <motion.span
                      aria-hidden
                      variants={{
                        rest: { x: '-130%', skewX: -12 },
                        hovered: { x: '280%', skewX: -12, transition: { duration: 0.5, ease: 'easeOut' } },
                      }}
                      style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)',
                        zIndex: 1, pointerEvents: 'none',
                      }}
                    />
                    {loading ? 'Signing in\u2026' : <><span>Sign in</span><ArrowUpRight style={{ height: 14, width: 14 }} /></>}
                  </motion.button>
                </motion.div>

                {/* "or" divider and Google button removed */}

                {/* marginBottom 24 on last form element */}
                <p style={{ textAlign: 'center', fontSize: 12, margin: 0, marginBottom: 24, color: '#555' }}>
                  Don&apos;t have an account?{' '}
                  <Link href="/signup" style={{ color: '#f0f0f0', textDecoration: 'underline', textUnderlineOffset: 4 }}>
                    Create one
                  </Link>
                </p>
              </form>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── FIXED FOOTER ───────────────────────────────────────────────────── */}
      <footer style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        background: 'rgba(8,8,8,0.85)',
        padding: '16px 48px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.24em', color: '#444', fontFamily: 'monospace' }}>
          © Benchly · Lab Notebook
        </span>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.24em', color: '#444', fontFamily: 'monospace' }}>
          Privacy · Terms
        </span>
      </footer>

    </div>
  )
}
