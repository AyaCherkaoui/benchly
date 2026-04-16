export interface Protocol {
  id: string
  name: string
  description: string
  created_at: string
}

export interface Step {
  id: string
  protocol_id: string
  step_number: number
  title: string
  instructions: string
  warning?: string
  timer_seconds?: number
}

export interface Session {
  id: string
  user_id: string
  protocol_id: string
  current_step: number
  completed_steps: number[]
  started_at: string
  last_updated: string
}

export interface Sample {
  id: string
  user_id: string
  session_id?: string | null
  protocol_id?: string | null
  sample_id_label: string
  tube_label: string
  location: string
  notes?: string | null
  created_at: string
}

export interface User {
  id: string
  email: string
  created_at: string
}
