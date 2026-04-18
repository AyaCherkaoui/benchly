'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav
      className="flex h-14 w-full items-center px-8"
      style={{ background: '#0a0a0a', borderBottom: '1px solid var(--border)' }}
    >
      {/* Logo */}
      <Link
        href="/dashboard"
        className="mr-12 flex-shrink-0 font-serif text-lg font-normal"
        style={{ color: 'var(--text-primary)' }}
      >
        Benchly
      </Link>

      {/* Nav links */}
      <div className="flex flex-1 items-center gap-8">
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

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="flex-shrink-0 transition-colors duration-150 hover:opacity-80"
        style={{
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        Sign Out
      </button>
    </nav>
  )
}
