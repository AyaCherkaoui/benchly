'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FlaskConical, TestTube, Users } from 'lucide-react'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/protocol', label: 'Protocol Walker', icon: FlaskConical },
  { href: '/samples', label: 'Samples', icon: TestTube },
  { href: '/meeting', label: 'Lab Meeting', icon: Users },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 flex-col gap-1 border-r border-slate-700/50 bg-[#152235] px-3 py-6">
      <div className="mb-6 px-3">
        <span className="text-lg font-bold text-teal-400">Benchly</span>
      </div>

      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-teal-500/10 text-teal-400'
                : 'text-slate-400 hover:bg-slate-700/40 hover:text-white'
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        )
      })}
    </aside>
  )
}
