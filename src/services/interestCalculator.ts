import type { InterestResult, PhaseDetail } from '../types'

const APRIL_1_2025 = new Date('2025-04-01')
const RATE_1 = 1
const RATE_1_15 = 1.15
const MIN_DAYS = 15

const daysBetween = (start: Date, end: Date): number =>
  Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

/**
 * Count fractional months between two dates (for display only).
 */
function countMonths(start: Date, end: Date): number {
  let months = 0
  const current = new Date(start)
  while (true) {
    const next = new Date(current)
    next.setMonth(next.getMonth() + 1)
    if (next > end) break
    months++
    current.setTime(next.getTime())
  }
  const remainingMs = end.getTime() - current.getTime()
  const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24))
  if (remainingDays > 0) {
    const dim = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
    months += remainingDays / dim
  }
  return months
}

/**
 * Monthly compound interest using 30-day month convention.
 * Full months compound, remaining days are pro-rated.
 *
 *   monthlyRate = rupees per 100 per month (e.g. 1 = 1%)
 *
 * Example: ₹20,000 at 1% for 15 days → 20,000 × 0.01 × (15/30) = ₹100
 */
function monthlyCompoundInterest(
  principal: number,
  monthlyRate: number,
  days: number
): { finalAmount: number; interest: number } {
  const rateDecimal = monthlyRate / 100
  const fullMonths = Math.floor(days / 30)
  const remainingDays = days % 30

  // Compound for full months
  let amount = principal * Math.pow(1 + rateDecimal, fullMonths)

  // Pro-rate remaining partial month
  if (remainingDays > 0) {
    amount = amount + amount * rateDecimal * (remainingDays / 30)
  }

  return { finalAmount: amount, interest: amount - principal }
}

/**
 * Check if a pledge spans the Apr 1 2025 boundary for a given release date.
 */
export function isTwoPhase(pledgeDate: string | Date, releaseDate: string | Date): boolean {
  return new Date(pledgeDate) < APRIL_1_2025 && new Date(releaseDate) >= APRIL_1_2025
}

export function calculatePawnInterest(
  principal: number,
  pledgeDate: string | Date,
  releaseDate: string | Date,
  rate: number,
  phase1Rate?: number,
  phase2Rate?: number
): InterestResult {
  const pDate = new Date(pledgeDate)
  const rDate = new Date(releaseDate)

  if (rDate < pDate) throw new Error('Release date cannot be before pledge date')

  const actualDays = daysBetween(pDate, rDate)
  const effectiveDays = actualDays < MIN_DAYS ? MIN_DAYS : actualDays

  const details: InterestResult['details'] = {
    principal,
    pledgeDate: pDate.toISOString().split('T')[0],
    releaseDate: rDate.toISOString().split('T')[0],
    actualDays,
    effectiveDays,
    minDayRuleApplied: actualDays < MIN_DAYS,
    phases: []
  }

  let totalInterest = 0
  let finalAmount = principal

  if (pDate < APRIL_1_2025 && rDate >= APRIL_1_2025) {
    const r1 = phase1Rate ?? RATE_1
    const r2 = phase2Rate ?? RATE_1_15

    // PHASE 1: pledge_date -> Mar 31
    const mar31 = new Date('2025-03-31')
    const p1Days = daysBetween(pDate, mar31)
    const p1Months = countMonths(pDate, mar31)
    const p1 = monthlyCompoundInterest(principal, r1, p1Days)

    details.phases.push(
      makePhase(1, pDate, mar31, p1Days, p1Months, r1, principal, p1.interest, p1.finalAmount)
    )

    // PHASE 2: Apr 1 -> release_date
    const p2Days = daysBetween(APRIL_1_2025, rDate)
    const p2Months = countMonths(APRIL_1_2025, rDate)
    const p2 = monthlyCompoundInterest(p1.finalAmount, r2, p2Days)

    details.phases.push(
      makePhase(2, APRIL_1_2025, rDate, p2Days, p2Months, r2, p1.finalAmount, p2.interest, p2.finalAmount)
    )

    totalInterest = Math.round(p1.interest + p2.interest)
    finalAmount = principal + totalInterest
  } else {
    const months = countMonths(pDate, rDate)
    const result = monthlyCompoundInterest(principal, rate, effectiveDays)
    totalInterest = Math.round(result.interest)
    finalAmount = principal + totalInterest

    details.phases.push(
      makePhase(1, pDate, rDate, effectiveDays, months, rate, principal, result.interest, result.finalAmount)
    )
  }

  return { totalInterest, finalAmount, details }
}

function makePhase(
  phase: number, start: Date, end: Date, days: number, months: number,
  rate: number, principal: number, interest: number, output: number
): PhaseDetail {
  return {
    phase,
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
    days,
    months: months.toFixed(2),
    rate,
    yearlyPercentage: (rate * 12).toFixed(2) + '%',
    principal: principal.toFixed(2),
    interest: Math.round(interest).toString(),
    output: Math.round(output).toString()
  }
}

export function getRateLabel(rate: number): string {
  if (rate === 1) return '12% / year'
  if (rate === 1.15) return '13.8% / year'
  if (rate === 1.25) return '15% / year'
  return `${(rate * 12).toFixed(1)}% / year`
}
