'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard', label: 'Home' },
  { href: '/protocol', label: 'Protocol' },
  { href: '/samples', label: 'Samples' },
  { href: '/log', label: 'Calendar' },
  { href: '/meeting', label: 'Summary' },
]

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    NAV.forEach(({ href }) => router.prefetch(href))
  }, [router])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <nav
        className="flex h-14 w-full items-center px-5 md:px-8"
        style={{ background: '#0a0a0a', borderBottom: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex-shrink-0 font-serif text-lg font-normal"
          style={{ color: 'var(--text-primary)' }}
        >
          Benchly
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex flex-1 items-center gap-8 ml-12">
          {NAV.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className="relative pb-0.5 transition-colors duration-150"
                style={{
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {label}
                {active && (
                  <span
                    className="absolute -bottom-[1px] left-0 right-0 h-px"
                    style={{ background: 'var(--accent)' }}
                  />
                )}
              </Link>
            )
          })}
        </div>

        {/* Desktop sign out */}
        <button
          onClick={handleSignOut}
          className="hidden md:block flex-shrink-0 ml-auto transition-colors duration-150 hover:opacity-80"
          style={{
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Sign Out
        </button>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(true)}
          className="ml-auto flex md:hidden items-center justify-center p-1"
          aria-label="Open menu"
          style={{ color: 'var(--accent)' }}
        >
          <Menu size={24} />
        </button>
      </nav>

      {/* Mobile full-screen overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex flex-col"
            style={{ background: '#0a0a0a' }}
          >
            {/* Header */}
            <div
              className="flex h-14 flex-shrink-0 items-center justify-between px-5"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="font-serif text-lg font-normal" style={{ color: 'var(--text-primary)' }}>
                Benchly
              </span>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-1 transition-opacity hover:opacity-60"
                aria-label="Close menu"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Nav links */}
            <div className="flex flex-col gap-1 p-5 flex-1 overflow-y-auto">
              {NAV.map(({ href, label }, i) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <motion.div
                    key={href}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.2 }}
                  >
                    <Link
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between rounded-xl px-4 py-4 transition-colors"
                      style={{
                        color: active ? 'var(--accent)' : 'var(--text-primary)',
                        background: active ? 'rgba(232,165,152,0.06)' : 'transparent',
                        fontSize: 17,
                        letterSpacing: '0.01em',
                      }}
                    >
                      {label}
                      {active && (
                        <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
                      )}
                    </Link>
                  </motion.div>
                )
              })}
            </div>

            {/* Sign out at bottom */}
            <div className="flex-shrink-0 p-5" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => { setMenuOpen(false); handleSignOut() }}
                className="w-full rounded-xl py-3.5 text-center transition-opacity hover:opacity-80"
                style={{
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
