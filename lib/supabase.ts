import { createClient } from '@supabase/supabase-js'
import { createBrowserClient, createServerClient } from '@supabase/auth-helpers-nextjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Server-side client (for use in Server Components and Route Handlers)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Client-side client (for use in Client Components — persists session via cookies)
export const createSupabaseBrowserClient = () =>
  createBrowserClient(supabaseUrl, supabaseAnonKey)

// Server-side client with cookie access (for use in Server Components with auth)
export { createServerClient }
