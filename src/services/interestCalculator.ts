import type { InterestResult, PhaseDetail } from '../types'

const APRIL_1_2025 = new Date('2025-04-01')
const RATE_1 = 1
const RATE_1_15 = 1.15
const MIN_DAYS = 15

const daysBetween = (start: Date, end: Date): number =>
  Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

/**
 * Calendar duration between two dates as {years, months, days}.
 */
function calculateDuration(start: Date, end: Date): { years: number; months: number; days: number } {
  let years = end.getFullYear() - start.getFullYear()
  let months = end.getMonth() - start.getMonth()
  let days = end.getDate() - start.getDate()

  if (days < 0) {
    months--
    const prevMonthLastDay = new Date(end.getFullYear(), end.getMonth(), 0).getDate()
    if (start.getDate() > prevMonthLastDay) {
      days = end.getDate()
    } else {
      days = prevMonthLastDay - start.getDate() + end.getDate()
    }
  }

  if (months < 0) {
    years--
    months += 12
  }

  return { years, months, days }
}

function formatDuration(d: { years: number; months: number; days: number }): string {
  const parts: string[] = []
  if (d.years > 0) parts.push(`${d.years}y`)
  if (d.months > 0) parts.push(`${d.months}mo`)
  if (d.days > 0 || parts.length === 0) parts.push(`${d.days}d`)
  return parts.join(' ')
}

/**
 * Annual compound interest — Compound (12 M).
 *
 * 1. Compound for full calendar years: P × (1 + annualRate)^years
 * 2. Remaining partial year: simple interest with 30/360 convention
 * 3. Interest is floored (truncated) to match standard pawn calculators
 */
function annualCompoundInterest(
  principal: number,
  monthlyRate: number,
  startDate: Date,
  endDate: Date
): { finalAmount: number; interest: number; duration: { years: number; months: number; days: number } } {
  const annualRate = monthlyRate * 12 / 100
  const dur = calculateDuration(startDate, endDate)

  // Compound for full years
  let amount = principal * Math.pow(1 + annualRate, dur.years)

  // Simple interest for remaining months + days (30/360 convention)
  const remainingDays = dur.months * 30 + dur.days
  if (remainingDays > 0) {
    amount += amount * annualRate * remainingDays / 360
  }

  return { finalAmount: amount, interest: amount - principal, duration: dur }
}

/**
 * Check if a pledge spans the Apr 1 2025 boundary.
 * Two-phase breakdown only applies to M-series (Murali) items.
 */
export function isTwoPhase(
  pledgeDate: string | Date,
  releaseDate: string | Date,
  mediator?: string | null,
  forceTwoPhase: boolean = false
): boolean {
  const spansBoundary = new Date(pledgeDate) < APRIL_1_2025 && new Date(releaseDate) >= APRIL_1_2025
  if (!spansBoundary) return false
  if (forceTwoPhase) return true
  return !!mediator && mediator.toLowerCase() === 'murali'
}

export function calculatePawnInterest(
  principal: number,
  pledgeDate: string | Date,
  releaseDate: string | Date,
  rate: number,
  phase1Rate?: number,
  phase2Rate?: number,
  mediator?: string | null,
  forceTwoPhase: boolean = false
): InterestResult {
  const pDate = new Date(pledgeDate)
  const rDate = new Date(releaseDate)

  if (rDate < pDate) throw new Error('Release date cannot be before pledge date')

  const actualDays = daysBetween(pDate, rDate)
  const minDayApplied = actualDays < MIN_DAYS
  const effectiveDays = minDayApplied ? MIN_DAYS : actualDays

  const details: InterestResult['details'] = {
    principal,
    pledgeDate: pDate.toISOString().split('T')[0],
    releaseDate: rDate.toISOString().split('T')[0],
    actualDays,
    effectiveDays,
    minDayRuleApplied: minDayApplied,
    phases: []
  }

  let totalInterest = 0
  let finalAmount = principal

  const useTwoPhase = isTwoPhase(pDate, rDate, mediator, forceTwoPhase)
  if (useTwoPhase) {
    const r1 = phase1Rate ?? RATE_1
    const r2 = phase2Rate ?? RATE_1_15

    // PHASE 1: pledge_date → Mar 31 2025
    const mar31 = new Date('2025-03-31')
    const p1Days = daysBetween(pDate, mar31)
    const p1 = annualCompoundInterest(principal, r1, pDate, mar31)
    const p1Interest = Math.floor(p1.interest)
    const p1Total = principal + p1Interest

    details.phases.push(
      makePhase(1, pDate, mar31, p1Days, formatDuration(p1.duration), r1, principal, p1Interest, p1Total)
    )

    // PHASE 2: Apr 1 2025 → release_date (uses Phase 1 total as principal)
    const p2Days = daysBetween(APRIL_1_2025, rDate)
    const p2 = annualCompoundInterest(p1Total, r2, APRIL_1_2025, rDate)
    const p2Interest = Math.floor(p2.interest)
    const p2Total = p1Total + p2Interest

    details.phases.push(
      makePhase(2, APRIL_1_2025, rDate, p2Days, formatDuration(p2.duration), r2, p1Total, p2Interest, p2Total)
    )

    totalInterest = p1Interest + p2Interest
    finalAmount = principal + totalInterest
  } else {
    // SINGLE PHASE
    let interest: number
    let dur: { years: number; months: number; days: number }

    if (minDayApplied) {
      // Min-day rule: simple interest for 15 days
      const annualRate = rate * 12 / 100
      interest = Math.floor(principal * annualRate * MIN_DAYS / 360)
      dur = { years: 0, months: 0, days: MIN_DAYS }
    } else {
      const result = annualCompoundInterest(principal, rate, pDate, rDate)
      interest = Math.floor(result.interest)
      dur = result.duration
    }

    totalInterest = interest
    finalAmount = principal + totalInterest

    details.phases.push(
      makePhase(1, pDate, rDate, effectiveDays, formatDuration(dur), rate, principal, interest, finalAmount)
    )
  }

  return { totalInterest, finalAmount, details }
}

function makePhase(
  phase: number, start: Date, end: Date, days: number, duration: string,
  rate: number, principal: number, interest: number, output: number
): PhaseDetail {
  return {
    phase,
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
    days,
    months: duration,
    rate,
    yearlyPercentage: (rate * 12).toFixed(2) + '%',
    principal: principal.toFixed(2),
    interest: interest.toString(),
    output: output.toString()
  }
}

export function getRateLabel(rate: number): string {
  if (rate === 1) return '12% / year'
  if (rate === 1.15) return '13.8% / year'
  if (rate === 1.25) return '15% / year'
  return `${(rate * 12).toFixed(1)}% / year`
}
