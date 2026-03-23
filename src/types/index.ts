export interface PawnItem {
  id: string
  user_id?: string
  serial_number: string
  mediator: string | null
  mediator_name: string | null
  item_type: string | null
  customer_name: string | null
  weight: number | null
  amount: number
  interest_rate: number
  pledge_date: string
  image_url: string | null
  status: 'active' | 'released'
  created_at?: string
  updated_at?: string
}

export interface PawnAllocation {
  id: string
  item_id: string
  user_id?: string
  allocated_name: string
  amount: number
  interest_rate: number
  allocation_date: string
  status: 'active' | 'released'
  released_at: string | null
  created_at?: string
  updated_at?: string
}

export interface PawnPartPayment {
  id: string
  item_id: string
  user_id?: string
  amount: number
  payment_date: string
  note: string | null
  created_at?: string
}

export interface PawnHistory {
  id: string
  user_id?: string
  serial_number: string
  customer_name: string | null
  amount: number
  interest_rate: number
  pledge_date: string
  release_date: string
  total_interest: number
  final_amount: number
  source_principal?: number | null
  source_interest?: number | null
  source_total?: number | null
  source_shopkeepers?: string | null
  image_url: string | null
  created_at?: string
}

export interface PhaseDetail {
  phase: number
  startDate: string
  endDate: string
  days: number
  months: string
  rate: number
  yearlyPercentage: string
  principal: string
  interest: string
  output: string
}

export interface CalculationDetails {
  principal: number
  pledgeDate: string
  releaseDate: string
  actualDays: number
  effectiveDays: number
  minDayRuleApplied: boolean
  phases: PhaseDetail[]
}

export interface InterestResult {
  totalInterest: number
  finalAmount: number
  details: CalculationDetails
}

export type RateOption = 1 | 1.15 | 1.25 | 1.5 | 2 | 3 | 5 | 'custom'
