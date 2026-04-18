'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  FlaskConical, Microscope, GraduationCap, BarChart2, Beaker, BookOpen,
  ArrowUpRight, Mail, Lock, User, Check,
} from 'lucide-react'
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

const ROLES = [
  { value: 'intern', label: 'Intern', Icon: FlaskConical },
  { value: 'lab_assistant', label: 'Lab Assistant', Icon: Beaker },
  { value: 'phd', label: 'PhD Student', Icon: GraduationCap },
  { value: 'masters', label: 'Masters', Icon: BookOpen },
  { value: 'postdoc', label: 'Postdoc', Icon: Microscope },
  { value: 'pi', label: 'PI', Icon: BarChart2 },
]

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

export default function SignupPage() {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [labName, setLabName] = useState('')
  const [role, setRole] = useState('intern')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) { playSound(200, 0.3, 0.04); setError(signUpError.message); setLoading(false); return }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError || !signInData.user) { playSound(200, 0.3, 0.04); setError(signInError?.message ?? 'Could not sign in'); setLoading(false); return }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: signInData.user.id,
      full_name: fullName,
      role,
      lab_name: labName,
      onboarding_complete: false,
    })
    if (profileError) { playSound(200, 0.3, 0.04); setError(profileError.message); setLoading(false); return }

    playSound(880, 0.1); setTimeout(() => playSound(1100, 0.15), 100)
    router.push('/onboarding')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#080808', position: 'relative', overflow: 'hidden' }}>

      {/* Light leak — top-left only */}
      <div style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, width: 600, height: 600, background: 'conic-gradient(from 198deg at -8% -8%, rgba(232,165,152,0.18) 0deg, transparent 40deg)', zIndex: 0 }} />
      <div style={{ pointerEvents: 'none', position: 'absolute', top: -60, left: -60, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,165,152,0.12) 0%, transparent 70%)', zIndex: 0 }} />

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
          padding: '0 64px',
          zIndex: 1,
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 56, textDecoration: 'none' }}>
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: '#f0f0f0', fontWeight: 400 }}>Benchly</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <motion.div
            animate={{ scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: 52, height: 52, borderRadius: '50%', border: '1px solid rgba(232,165,152,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#e8a598', opacity: 0.6 }} />
          </motion.div>
          <div style={{ height: 1, width: 64, background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#555', fontFamily: 'monospace' }}>
            Lab Co-pilot · v2.4
          </span>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 44 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 'clamp(56px, 5.5vw, 96px)', lineHeight: 0.92, letterSpacing: '-0.025em', margin: 0, color: '#f0f0f0' }}
        >
          A quieter way<br />
          <span style={{ color: '#e8a598' }}>to run the bench.</span>
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

        <ul style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 20, listStyle: 'none', padding: 0, margin: '40px 0 0' }}>
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
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          background: '#0d0d0d',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '80px 40px 120px',
          zIndex: 1,
          position: 'relative',
          overflowY: 'auto',
          minHeight: '100vh',
        }}
      >
        {/* Mobile header */}
        <div className="flex lg:hidden" style={{ position: 'absolute', top: 24, left: 24, alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 16, color: '#f0f0f0' }}>Benchly</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: '100%', maxWidth: 440, position: 'relative', marginTop: 40 }}
        >
          {/* Rotating gradient border */}
          <div style={{ position: 'relative', borderRadius: 14 }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute', inset: -1, borderRadius: 14, zIndex: 0,
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(232,165,152,0.6) 60deg, transparent 120deg, transparent 360deg)',
              }}
            />

            {/* Card */}
            <div style={{ position: 'relative', zIndex: 1, background: '#111111', borderRadius: 13, padding: '36px 36px 40px' }}>

              {/* Two-step progress bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.22em', color: '#555', marginRight: 4, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  Step 1 of 2
                </span>
                <div style={{ flex: 1, display: 'flex', gap: 3 }}>
                  <div style={{ flex: 1, height: 2, borderRadius: 2, background: '#e8a598' }} />
                  <div style={{ flex: 1, height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }} />
                </div>
              </div>

              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 30, color: '#f0f0f0', margin: 0, fontWeight: 400 }}>
                Step into <span style={{ fontStyle: 'italic', color: '#e8a598' }}>Benchly</span>
              </h2>
              <p style={{ fontSize: 13, color: '#555', marginTop: 8, marginBottom: 0 }}>
                Free for 30 days. No card. No noise.
              </p>

              <form onSubmit={handleSignup} style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 22 }}>
                <Field icon={<User style={{ height: 14, width: 14 }} />} label="Full name" type="text" value={fullName} onChange={setFullName} placeholder="Dr. Ada Lovelace" delay={0.2} />
                <Field icon={<Mail style={{ height: 14, width: 14 }} />} label="Work email" type="email" value={email} onChange={setEmail} placeholder="ada@yourlab.org" delay={0.26} />
                <Field icon={<Lock style={{ height: 14, width: 14 }} />} label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" delay={0.32} />
                <Field icon={<FlaskConical style={{ height: 14, width: 14 }} />} label="Lab name" type="text" value={labName} onChange={setLabName} placeholder="e.g. Kaplan Lab" delay={0.38} />

                {/* Role cards */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }}>
                  <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#555', marginBottom: 10, fontFamily: 'monospace' }}>
                    Your role
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {ROLES.map(({ value, label, Icon }) => {
                      const selected = role === value
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => { setRole(value); playSound(600, 0.06, 0.02) }}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            gap: 6, padding: '12px 8px',
                            background: selected ? 'rgba(232,165,152,0.08)' : 'transparent',
                            border: `1px solid ${selected ? '#e8a598' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: 10, cursor: 'pointer',
                            transform: selected ? 'scale(1.03)' : 'scale(1)',
                            transition: 'all 150ms ease',
                          }}
                        >
                          <Icon size={18} color={selected ? '#e8a598' : '#555555'} />
                          <span style={{ fontSize: 11, color: selected ? '#e8a598' : '#555555', letterSpacing: '0.04em' }}>{label}</span>
                        </button>
                      )
                    })}
                  </div>
                </motion.div>

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
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.52 }}>
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
                    {loading ? 'Setting up your bench\u2026' : <><span>Begin</span><ArrowUpRight style={{ height: 14, width: 14 }} /></>}
                  </motion.button>
                </motion.div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                  <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.24em', color: '#444', fontFamily: 'monospace' }}>or</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                </div>

                <button
                  type="button"
                  style={{
                    width: '100%', height: 44, borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
                    color: 'rgba(255,255,255,0.7)',
                    fontFamily: 'monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.22em',
                    cursor: 'pointer',
                  }}
                >
                  Continue with Google
                </button>

                <p style={{ textAlign: 'center', fontSize: 12, margin: 0, color: '#555' }}>
                  Already have an account?{' '}
                  <Link href="/login" style={{ color: '#f0f0f0', textDecoration: 'underline', textUnderlineOffset: 4 }}>
                    Sign in
                  </Link>
                </p>
              </form>
            </div>
          </div>
        </motion.div>
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
