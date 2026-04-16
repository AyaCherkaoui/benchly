'use client'

import Sidebar from '@/components/Sidebar'
import HandsFreeMode from '@/components/HandsFreeMode'
import { ProtocolSessionProvider } from '@/contexts/ProtocolSessionContext'

/**
 * Client shell that provides the ProtocolSessionContext and renders the
 * app chrome (sidebar + HandsFreeMode bubble).  The layout.tsx (server
 * component) delegates its visual structure here so it can stay a server
 * component and keep the auth redirect logic.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtocolSessionProvider>
      <div className="flex min-h-screen bg-[#0d1b2a]">
        <Sidebar />
        <main className="flex-1 p-8 text-white">{children}</main>
      </div>
      {/* HandsFreeMode is fixed-position and lives outside the flex layout */}
      <HandsFreeMode />
    </ProtocolSessionProvider>
  )
}
