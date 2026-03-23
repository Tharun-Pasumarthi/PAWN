import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Search, Loader2, ChevronDown, ChevronUp, AlertCircle, Check, Calendar, Package
} from 'lucide-react'
import { supabase } from '../services/supabaseClient'
import { calculatePawnInterest, isTwoPhase } from '../services/interestCalculator'
import ImageLightbox from '../components/ImageLightbox'
import ResolvedImage from '../components/ResolvedImage'
import { useAuth } from '../contexts/AuthContext'
import type { PawnAllocation, PawnItem, PawnPartPayment, InterestResult } from '../types'

export default function ReleaseItem() {
  const navigate = useNavigate()
  const { isSuperUser } = useAuth()

  const [allItems, setAllItems] = useState<PawnItem[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [filterText, setFilterText] = useState('')
  const [allocations, setAllocations] = useState<PawnAllocation[]>([])
  const [partPayments, setPartPayments] = useState<PawnPartPayment[]>([])

  const [serial, setSerial] = useState('')
  const [item, setItem] = useState<PawnItem | null>(null)
  const [searching, setSearching] = useState(false)
  const [releasing, setReleasing] = useState(false)

  const defaultSingleRate = isSuperUser ? '1' : '1.5'
  const defaultPhaseRate1 = isSuperUser ? '1' : '1.5'
  const defaultPhaseRate2 = isSuperUser ? '1.15' : '1.5'

  const [rateOption, setRateOption] = useState<string>(defaultSingleRate)
  const [customRate, setCustomRate] = useState('')
  const [p1Rate, setP1Rate] = useState<string>(defaultPhaseRate1)
  const [p1Custom, setP1Custom] = useState('')
  const [p2Rate, setP2Rate] = useState<string>(defaultPhaseRate2)
  const [p2Custom, setP2Custom] = useState('')
  const [usePhaseCalculator, setUsePhaseCalculator] = useState(false)
  const [phaseBoundaryDate, setPhaseBoundaryDate] = useState('2025-04-01')
  const [releaseDate, setReleaseDate] = useState(todayStr())
  const [calc, setCalc] = useState<InterestResult | null>(null)
  const [showPhases, setShowPhases] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [removingAllocationId, setRemovingAllocationId] = useState<string | null>(null)

  const rateOptions = isSuperUser ? SUPER_RATES : NORMAL_RATES

  const loadItemExtras = async (itemId: string) => {
    try {
      const [{ data: allocRows }, { data: partRows }] = await Promise.all([
        supabase
          .from('pawn_allocations')
          .select('*')
          .eq('item_id', itemId)
          .eq('status', 'active')
          .order('allocation_date', { ascending: true }),
        supabase
          .from('pawn_part_payments')
          .select('*')
          .eq('item_id', itemId)
          .order('payment_date', { ascending: true })
      ])

      setAllocations((allocRows ?? []) as PawnAllocation[])
      setPartPayments((partRows ?? []) as PawnPartPayment[])
    } catch {
      setAllocations([])
      setPartPayments([])
    }
  }

  // Fetch all active items on mount
  useEffect(() => {
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('pawn_items')
          .select('*')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
        if (error) throw error
        setAllItems((data ?? []) as PawnItem[])
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to load items')
      } finally {
        setLoadingItems(false)
      }
    })()
  }, [])

  const filteredItems = allItems.filter(i => {
    if (!filterText.trim()) return true
    const q = filterText.toLowerCase()
    return i.serial_number.toLowerCase().includes(q) ||
      (i.customer_name ?? '').toLowerCase().includes(q) ||
      String(i.amount).includes(q)
  })

  const selectItem = (picked: PawnItem) => {
    setItem(picked)
    setAllocations([])
    setPartPayments([])
    setSerial(picked.serial_number)
    setCalc(null)
    loadItemExtras(picked.id)
    const mandatoryPhase = isTwoPhase(picked.pledge_date, releaseDate, picked.mediator_name)
    const baseRates = (isSuperUser ? SUPER_BASE_RATES : NORMAL_BASE_RATES) as readonly string[]
    if (mandatoryPhase) {
      setUsePhaseCalculator(true)
      setPhaseBoundaryDate('2025-04-01')
      setP1Rate(defaultPhaseRate1)
      setP2Rate(defaultPhaseRate2)
      recalculate(picked, defaultPhaseRate1, '', releaseDate, defaultPhaseRate1, '', defaultPhaseRate2, '', true, '2025-04-01')
    } else {
      setUsePhaseCalculator(false)
      const pickedRate = String(picked.interest_rate)
      if (baseRates.includes(pickedRate as typeof baseRates[number])) {
        setRateOption(pickedRate)
        setCustomRate('')
        recalculate(picked, pickedRate, '', releaseDate, defaultPhaseRate1, '', defaultPhaseRate2, '', false, phaseBoundaryDate)
      } else {
        setRateOption('custom')
        setCustomRate(pickedRate)
        recalculate(picked, 'custom', pickedRate, releaseDate, defaultPhaseRate1, '', defaultPhaseRate2, '', false, phaseBoundaryDate)
      }
    }
  }

  const searchItem = useCallback(async () => {
    if (!serial.trim()) { toast.error('Enter a serial number'); return }
    setSearching(true)
    setItem(null)
    setCalc(null)
    try {
      const { data, error } = await supabase
        .from('pawn_items')
        .select('*')
        .eq('serial_number', serial.trim())
        .eq('status', 'active')
        .maybeSingle()
      if (error) throw error
      if (!data) { toast.error('Item not found or already released'); return }
      setItem(data as PawnItem)
      setAllocations([])
      setPartPayments([])
      loadItemExtras((data as PawnItem).id)
      const mandatoryPhase = isTwoPhase(data.pledge_date, releaseDate, (data as PawnItem).mediator_name)
      const baseRates = (isSuperUser ? SUPER_BASE_RATES : NORMAL_BASE_RATES) as readonly string[]
      if (mandatoryPhase) {
        setUsePhaseCalculator(true)
        setPhaseBoundaryDate('2025-04-01')
        setP1Rate(defaultPhaseRate1)
        setP2Rate(defaultPhaseRate2)
        recalculate(data as PawnItem, defaultPhaseRate1, '', releaseDate, defaultPhaseRate1, '', defaultPhaseRate2, '', true, '2025-04-01')
      } else {
        setUsePhaseCalculator(false)
        const pickedRate = String((data as PawnItem).interest_rate)
        if (baseRates.includes(pickedRate as typeof baseRates[number])) {
          setRateOption(pickedRate)
          setCustomRate('')
          recalculate(data as PawnItem, pickedRate, '', releaseDate, defaultPhaseRate1, '', defaultPhaseRate2, '', false, phaseBoundaryDate)
        } else {
          setRateOption('custom')
          setCustomRate(pickedRate)
          recalculate(data as PawnItem, 'custom', pickedRate, releaseDate, defaultPhaseRate1, '', defaultPhaseRate2, '', false, phaseBoundaryDate)
        }
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Search failed')
    } finally {
      setSearching(false)
    }
  }, [serial, releaseDate, isSuperUser, defaultPhaseRate1, defaultPhaseRate2, phaseBoundaryDate])

  const phaseMandatory = item ? isTwoPhase(item.pledge_date, releaseDate, item.mediator_name) : false
  // Any item with at least 2 days can use phase calculator
  const phaseEligible = item ? (daysBetweenStr(item.pledge_date, releaseDate) >= 2 || phaseMandatory) : false
  const twoPhase = item ? (phaseMandatory || (usePhaseCalculator && phaseEligible)) : false

  const resolveRate = (opt: string, custom: string): number | undefined => {
    if (opt === 'custom') {
      const v = Number(custom)
      return v > 0 ? v : undefined
    }
    return Number(opt)
  }

  const computeBaseCalculation = (
    it: PawnItem | null = item,
    rOpt: string = rateOption,
    cRate: string = customRate,
    rDate: string = releaseDate,
    pr1: string = p1Rate,
    pc1: string = p1Custom,
    pr2: string = p2Rate,
    pc2: string = p2Custom,
    phaseToggle: boolean = usePhaseCalculator,
    boundary: string = phaseBoundaryDate
  ): InterestResult | null => {
    if (!it) return null
    const mandatoryPhase = isTwoPhase(it.pledge_date, rDate, it.mediator_name)
    const eligibleNow = daysBetweenStr(it.pledge_date, rDate) >= 2 || mandatoryPhase
    const isTwo = mandatoryPhase || (phaseToggle && eligibleNow)

    if (isTwo) {
      const r1 = resolveRate(pr1, pc1)
      const r2 = resolveRate(pr2, pc2)
      if (!r1 || !r2) return null
      try {
        return calculatePawnInterest(it.amount, it.pledge_date, rDate, 1, r1, r2, it.mediator_name, isTwo, boundary)
      } catch (err: any) {
        toast.error(err.message)
        return null
      }
    } else {
      let rate = Number(rOpt)
      if (rOpt === 'custom') {
        rate = Number(cRate)
        if (!rate || rate <= 0) return null
      }
      try {
        return calculatePawnInterest(it.amount, it.pledge_date, rDate, rate, undefined, undefined, it.mediator_name)
      } catch (err: any) {
        toast.error(err.message)
        return null
      }
    }
  }

  const recalculate = (
    it: PawnItem | null = item,
    rOpt: string = rateOption,
    cRate: string = customRate,
    rDate: string = releaseDate,
    pr1: string = p1Rate,
    pc1: string = p1Custom,
    pr2: string = p2Rate,
    pc2: string = p2Custom,
    phaseToggle: boolean = usePhaseCalculator,
    boundary: string = phaseBoundaryDate
  ) => {
    const next = computeBaseCalculation(it, rOpt, cRate, rDate, pr1, pc1, pr2, pc2, phaseToggle, boundary)
    setCalc(next)
  }

  const allocationBreakdown = useMemo(() => {
    if (!item) return [] as Array<{
      allocation: PawnAllocation
      interest: number
      finalAmount: number
      effectiveDays: number
    }>

    return allocations
      .filter(a => new Date(a.allocation_date).getTime() <= new Date(releaseDate).getTime())
      .map(a => {
        const allocCalc = computeBaseCalculation(
          {
            ...item,
            amount: Number(a.amount),
            pledge_date: a.allocation_date,
            interest_rate: Number(a.interest_rate)
          },
          String(a.interest_rate),
          '',
          releaseDate,
          p1Rate,
          p1Custom,
          p2Rate,
          p2Custom,
          false,
          phaseBoundaryDate
        )

        return {
          allocation: a,
          interest: allocCalc?.totalInterest ?? 0,
          finalAmount: allocCalc?.finalAmount ?? Number(a.amount),
          effectiveDays: allocCalc?.details.effectiveDays ?? daysBetweenStr(a.allocation_date, releaseDate)
        }
      })
  }, [item, allocations, releaseDate, p1Rate, p1Custom, p2Rate, p2Custom, phaseBoundaryDate])

  const allocationBreakdownById = useMemo(() => {
    return new Map(allocationBreakdown.map(row => [row.allocation.id, row]))
  }, [allocationBreakdown])

  const releaseTotals = useMemo(() => {
    if (!item || !calc) {
      return {
        allocationCount: 0,
        allocationPrincipal: 0,
        allocationInterest: 0,
        allocationFinal: 0,
        partPaymentTotal: 0,
        partPaymentAppliedToBase: 0,
        postPaymentInterest: 0,
        baseInterest: calc?.totalInterest ?? 0,
        baseFinalAfterPartPayments: calc?.finalAmount ?? 0,
        finalToCollect: calc?.finalAmount ?? 0,
        selectedAllocationIds: [] as string[],
        selectedAllocationNames: [] as string[]
      }
    }

    const selectedAllocations = allocationBreakdown.map(row => row.allocation)
    const allocationPrincipal = allocationBreakdown.reduce((sum, row) => sum + Number(row.allocation.amount), 0)
    const allocationInterest = allocationBreakdown.reduce((sum, row) => sum + row.interest, 0)
    const allocationFinal = allocationBreakdown.reduce((sum, row) => sum + row.finalAmount, 0)

    const eligiblePartPayments = partPayments
      .filter(p => new Date(p.payment_date).getTime() <= new Date(releaseDate).getTime())
      .sort((a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime())

    const partPaymentTotal = eligiblePartPayments.reduce((sum, p) => sum + Number(p.amount), 0)

    let baseFinalAfterPartPayments = calc.finalAmount
    let postPaymentInterest = 0
    let baseDueBeforePartPayments = calc.finalAmount

    if (eligiblePartPayments.length) {
      const lastPaymentDate = eligiblePartPayments[eligiblePartPayments.length - 1].payment_date
      const paidTillLast = eligiblePartPayments
        .filter(p => new Date(p.payment_date).getTime() <= new Date(lastPaymentDate).getTime())
        .reduce((sum, p) => sum + Number(p.amount), 0)

      const baseAtLastPayment = computeBaseCalculation(
        item,
        rateOption,
        customRate,
        lastPaymentDate,
        p1Rate,
        p1Custom,
        p2Rate,
        p2Custom,
        usePhaseCalculator,
        phaseBoundaryDate
      )
      const dueAtLastPayment = baseAtLastPayment?.finalAmount ?? 0
      baseDueBeforePartPayments = dueAtLastPayment
      const remainingBaseAtLast = Math.max(0, dueAtLastPayment - paidTillLast)

      const continuationRate = resolveRate(twoPhase ? p2Rate : rateOption, twoPhase ? p2Custom : customRate) ?? 1.5
      if (remainingBaseAtLast > 0 && new Date(releaseDate).getTime() > new Date(lastPaymentDate).getTime()) {
        const continuation = calculatePawnInterest(remainingBaseAtLast, lastPaymentDate, releaseDate, continuationRate)
        postPaymentInterest = continuation.totalInterest
        baseFinalAfterPartPayments = continuation.finalAmount
      } else {
        baseFinalAfterPartPayments = remainingBaseAtLast
      }
    }

    const partPaymentAppliedToBase = Math.min(partPaymentTotal, baseDueBeforePartPayments)
    const baseInterest = Math.max(
      0,
      baseFinalAfterPartPayments + partPaymentAppliedToBase - Number(item.amount)
    )
    const finalToCollect = baseFinalAfterPartPayments

    return {
      allocationCount: selectedAllocations.length,
      allocationPrincipal,
      allocationInterest,
      allocationFinal,
      partPaymentTotal,
      partPaymentAppliedToBase,
      postPaymentInterest,
      baseInterest,
      baseFinalAfterPartPayments,
      finalToCollect,
      selectedAllocationIds: selectedAllocations.map(a => a.id),
      selectedAllocationNames: selectedAllocations
        .map(a => a.allocated_name.trim())
        .filter(Boolean)
    }
  }, [
    item,
    calc,
    allocationBreakdown,
    partPayments,
    releaseDate,
    rateOption,
    customRate,
    p1Rate,
    p1Custom,
    p2Rate,
    p2Custom,
    usePhaseCalculator,
    phaseBoundaryDate,
    twoPhase
  ])

  const onRateChange = (v: string) => { setRateOption(v); recalculate(item, v, customRate, releaseDate, p1Rate, p1Custom, p2Rate, p2Custom, usePhaseCalculator, phaseBoundaryDate) }
  const onCustomChange = (v: string) => { setCustomRate(v); recalculate(item, 'custom', v, releaseDate, p1Rate, p1Custom, p2Rate, p2Custom, usePhaseCalculator, phaseBoundaryDate) }
  const onDateChange = (v: string) => { setReleaseDate(v); recalculate(item, rateOption, customRate, v, p1Rate, p1Custom, p2Rate, p2Custom, usePhaseCalculator, phaseBoundaryDate) }
  const onP1Change = (v: string) => { setP1Rate(v); recalculate(item, rateOption, customRate, releaseDate, v, p1Custom, p2Rate, p2Custom, usePhaseCalculator, phaseBoundaryDate) }
  const onP1Custom = (v: string) => { setP1Custom(v); recalculate(item, rateOption, customRate, releaseDate, 'custom', v, p2Rate, p2Custom, usePhaseCalculator, phaseBoundaryDate) }
  const onP2Change = (v: string) => { setP2Rate(v); recalculate(item, rateOption, customRate, releaseDate, p1Rate, p1Custom, v, p2Custom, usePhaseCalculator, phaseBoundaryDate) }
  const onP2Custom = (v: string) => { setP2Custom(v); recalculate(item, rateOption, customRate, releaseDate, p1Rate, p1Custom, 'custom', v, usePhaseCalculator, phaseBoundaryDate) }
  const onBoundaryChange = (v: string) => { setPhaseBoundaryDate(v); recalculate(item, rateOption, customRate, releaseDate, p1Rate, p1Custom, p2Rate, p2Custom, usePhaseCalculator, v) }
  const onPhaseToggle = () => {
    if (!item || !phaseEligible || phaseMandatory) return
    const next = !usePhaseCalculator
    setUsePhaseCalculator(next)
    if (next) {
      setP1Rate(defaultPhaseRate1)
      setP2Rate(defaultPhaseRate2)
      // Default boundary: midpoint between pledge and release
      const pMs = new Date(item.pledge_date).getTime()
      const rMs = new Date(releaseDate).getTime()
      const midDate = new Date(pMs + (rMs - pMs) / 2).toISOString().split('T')[0]
      setPhaseBoundaryDate(midDate)
      recalculate(item, rateOption, customRate, releaseDate, defaultPhaseRate1, p1Custom, defaultPhaseRate2, p2Custom, true, midDate)
    } else {
      recalculate(item, rateOption, customRate, releaseDate, p1Rate, p1Custom, p2Rate, p2Custom, false, phaseBoundaryDate)
    }
  }

  const handleRemoveAllocation = async (allocation: PawnAllocation) => {
    if (!item) return
    if (!window.confirm(`Remove source loan from ${allocation.allocated_name}?`)) return

    setRemovingAllocationId(allocation.id)
    try {
      const { error } = await supabase
        .from('pawn_allocations')
        .update({ status: 'released', released_at: todayStr() })
        .eq('id', allocation.id)
      if (error) throw error

      setAllocations(prev => prev.filter(a => a.id !== allocation.id))
      toast.success('marked as unallocated')
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to remove allocation')
    } finally {
      setRemovingAllocationId(null)
    }
  }

  const handleRelease = async () => {
    if (!item || !calc) return

    const now = new Date()
    const todayStr2 = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    const todayMs = new Date(todayStr2).getTime()
    const selectedMs = new Date(releaseDate).getTime()
    const diffDays = Math.round((selectedMs - todayMs) / 86400000)
    if (diffDays > 0) {
      if (!window.confirm(`Release date is ${diffDays} day(s) in the future. Continue?`)) return
    } else if (diffDays < -30) {
      if (!window.confirm(`Release date is ${Math.abs(diffDays)} days in the past. Continue?`)) return
    }

    setReleasing(true)
    try {
      let historyRate = Number(rateOption)
      if (rateOption === 'custom') historyRate = Number(customRate)

      const combinedInterest = releaseTotals.baseInterest
      const historyPrincipal = Number(item.amount)

      const { error: hErr } = await supabase.from('pawn_history').insert([{
        serial_number: item.serial_number,
        customer_name: item.customer_name ?? null,
        amount: historyPrincipal,
        interest_rate: historyRate,
        pledge_date: item.pledge_date,
        release_date: releaseDate,
        total_interest: combinedInterest,
        final_amount: releaseTotals.finalToCollect,
        source_principal: releaseTotals.allocationPrincipal,
        source_interest: releaseTotals.allocationInterest,
        source_total: releaseTotals.allocationFinal,
        source_shopkeepers: releaseTotals.selectedAllocationNames.join(' | ') || null,
        image_url: item.image_url
      }])
      if (hErr) throw hErr

      const { error: uErr } = await supabase
        .from('pawn_items')
        .update({ status: 'released' })
        .eq('id', item.id)
      if (uErr) throw uErr

      if (releaseTotals.selectedAllocationIds.length > 0) {
        const { error: aErr } = await supabase
          .from('pawn_allocations')
          .update({ status: 'released', released_at: releaseDate })
          .in('id', releaseTotals.selectedAllocationIds)
        if (aErr) throw aErr
      }

      toast.success('Item released successfully!')
      navigate('/')
    } catch (err: any) {
      toast.error(err.message ?? 'Release failed')
    } finally {
      setReleasing(false)
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="topbar-back" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
          </button>
          <span className="topbar-title">Release Item</span>
        </div>
      </header>

      <main className="page-shell" style={{ paddingTop: 24 }}>
        <div style={{ maxWidth: 620, margin: '0 auto' }}>

          {/* ─── Search / Filter ─── */}
          <motion.div
            className="card"
            style={{ marginBottom: 20, padding: 16 }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  className="field-input"
                  style={{ width: '100%', paddingLeft: 42, fontSize: '1rem', fontWeight: 600 }}
                  value={item ? serial : filterText}
                  onChange={e => {
                    if (item) { setSerial(e.target.value) }
                    else { setFilterText(e.target.value) }
                  }}
                  placeholder={item ? 'Serial number' : 'Search items…'}
                  onKeyDown={e => e.key === 'Enter' && item === null && filterText.trim() && (() => {
                    setSerial(filterText.trim())
                    searchItem()
                  })()}
                />
              </div>
              {item && (
                <button
                  className="btn"
                  onClick={() => {
                    setItem(null)
                    setCalc(null)
                    setSerial('')
                    setFilterText('')
                    setAllocations([])
                    setPartPayments([])
                  }}
                  style={{ borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem' }}
                >
                  Back
                </button>
              )}
            </div>
          </motion.div>

          {/* ─── Active Items List ─── */}
          {!item && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Package size={16} color="var(--accent)" />
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                  Active Pledges ({filteredItems.length})
                </span>
              </div>

              {loadingItems ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '0.875rem' }}>Loading items…</div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)' }}>
                  <Package size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                    {filterText.trim() ? 'No matching items' : 'No active pledges'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
                  {filteredItems.map((itm, idx) => (
                    <motion.div
                      key={itm.id}
                      className="card"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: idx * 0.03 }}
                      onClick={() => selectItem(itm)}
                      style={{
                        cursor: 'pointer',
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        transition: 'var(--transition-fast)',
                      }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {itm.image_url ? (
                        <div style={{
                          width: 52, height: 52, borderRadius: 'var(--radius-sm)',
                          overflow: 'hidden', flexShrink: 0,
                          border: '1px solid var(--border-subtle)'
                        }}>
                          <ResolvedImage
                            src={itm.image_url}
                            alt=""
                            onClick={e => { e.stopPropagation(); setLightboxSrc(itm.image_url) }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
                            fallback={<Package size={22} color="var(--accent)" />}
                          />
                        </div>
                      ) : (
                        <div style={{
                          width: 52, height: 52, borderRadius: 'var(--radius-sm)',
                          background: 'var(--accent-light)', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <Package size={22} color="var(--accent)" />
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                          #{itm.serial_number}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {itm.customer_name && <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{itm.customer_name} · </span>}
                          {itm.mediator_name && <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{itm.mediator_name} · </span>}
                          {formatDate(itm.pledge_date)}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--accent)' }}>
                          ₹{Number(itm.amount).toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          ₹{Number(itm.interest_rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          <AnimatePresence>
            {item && (
              <motion.div
                key="item-details"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {/* ─── Item Info Card ─── */}
                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 16 }}>
                    Item Details
                  </div>

                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '1.0625rem', color: 'var(--text-primary)', marginBottom: 6 }}>
                        Serial: #{item.serial_number}
                      </div>
                      {item.customer_name && (
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}>
                          Customer: {item.customer_name}
                        </div>
                      )}
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent)', marginBottom: 4 }}>
                        Pledge: ₹{Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Pledge Date: {formatDate(item.pledge_date)}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {allocations.length === 0 ? (
                          <span className="badge badge-warning">Not Allocated</span>
                        ) : (
                          allocations.map(a => (
                            <span key={a.id} className="badge badge-info">{a.allocated_name}</span>
                          ))
                        )}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        Active Source Loans: {allocations.length}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        Part Payments: {partPayments.length}
                      </div>
                    </div>
                    {item.image_url && (
                      <div style={{ width: 80, height: 80, borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border-subtle)' }}>
                        <ResolvedImage
                          src={item.image_url}
                          alt="item"
                          onClick={() => setLightboxSrc(item.image_url)}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* ─── Interest Calculation Card ─── */}
                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 16 }}>
                    Interest Calculation
                  </div>

                  {allocations.length > 0 && (
                    <div style={{ marginBottom: 16, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 8 }}>
                        Source Loans
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {allocations.map(a => {
                          const sourceBreakdown = allocationBreakdownById.get(a.id)
                          return (
                            <div
                              key={a.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '10px 12px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-subtle)',
                                background: 'var(--bg-elevated)'
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span className="badge badge-info">{a.allocated_name}</span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {formatDate(a.allocation_date)} · ₹{Number(a.interest_rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div style={{ marginTop: 4, fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  ₹{Number(a.amount).toLocaleString('en-IN')} principal
                                </div>
                                {sourceBreakdown ? (
                                  <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    Interest: ₹{sourceBreakdown.interest.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Due: ₹{sourceBreakdown.finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {sourceBreakdown.effectiveDays} days
                                  </div>
                                ) : (
                                  <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Not counted for this release date.
                                  </div>
                                )}
                              </div>
                              <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                onClick={() => handleRemoveAllocation(a)}
                                disabled={removingAllocationId === a.id}
                              >
                                {removingAllocationId === a.id ? <Loader2 size={14} className="spin" /> : 'Remove'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {allocations.length === 0 && (
                    <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <span className="badge badge-warning">Unallocated</span>
                    </div>
                  )}

                  {partPayments.length > 0 && (
                    <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        Part Payments Applied: ₹{releaseTotals.partPaymentTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Part payments reduce only base pledge dues. Source loan dues are not reduced.
                      </div>
                    </div>
                  )}

                  {phaseEligible && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                        Phase Calculator
                      </label>
                      <button
                        className={`chip ${twoPhase ? 'active' : ''}`}
                        onClick={onPhaseToggle}
                        disabled={phaseMandatory}
                      >
                        {twoPhase ? 'Enabled' : 'Enable'}
                        {phaseMandatory ? ' (Mandatory for M series)' : ''}
                      </button>
                      <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {phaseMandatory
                          ? 'This M-series pledge must use phase-wise calculation.'
                          : 'Optional: split interest into two phases with different rates.'}
                      </div>
                      {twoPhase && (
                        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Split Date
                          </label>
                          <input
                            className="field-input"
                            type="date"
                            value={phaseBoundaryDate}
                            min={nextDay(item!.pledge_date)}
                            max={releaseDate}
                            onChange={e => onBoundaryChange(e.target.value)}
                            disabled={phaseMandatory}
                            style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, opacity: phaseMandatory ? 0.6 : 1 }}
                          />
                          {phaseMandatory && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Fixed</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rate controls */}
                  {twoPhase ? (
                    <>
                      {/* Phase 1 Rate */}
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                          Phase 1 Interest — Before {formatDate(phaseBoundaryDate)}
                        </label>
                        <div className="chip-group">
                          {rateOptions.map(r => (
                            <button key={r.value} className={`chip ${p1Rate === r.value ? 'active' : ''}`} onClick={() => onP1Change(r.value)}>
                              {r.label}
                            </button>
                          ))}
                        </div>
                        {p1Rate === 'custom' && (
                          <motion.input className="field-input" style={{ width: '100%', marginTop: 8 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            type="number" inputMode="decimal" value={p1Custom} onChange={e => onP1Custom(e.target.value)} placeholder="Custom interest" step="0.01" />
                        )}
                      </div>
                      {/* Phase 2 Rate */}
                      <div style={{ marginBottom: 20 }}>
                        <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                          Phase 2 Interest — From {formatDate(phaseBoundaryDate)}
                        </label>
                        <div className="chip-group">
                          {rateOptions.map(r => (
                            <button key={r.value} className={`chip ${p2Rate === r.value ? 'active' : ''}`} onClick={() => onP2Change(r.value)}>
                              {r.label}
                            </button>
                          ))}
                        </div>
                        {p2Rate === 'custom' && (
                          <motion.input className="field-input" style={{ width: '100%', marginTop: 8 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            type="number" inputMode="decimal" value={p2Custom} onChange={e => onP2Custom(e.target.value)} placeholder="Custom interest" step="0.01" />
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 8, display: 'block' }}>
                        Interest
                      </label>
                      <div className="chip-group">
                        {rateOptions.map(r => (
                          <button key={r.value} className={`chip ${rateOption === r.value ? 'active' : ''}`} onClick={() => onRateChange(r.value)}>
                            {r.label}
                          </button>
                        ))}
                      </div>
                      {rateOption === 'custom' && (
                        <motion.input className="field-input" style={{ width: '100%', marginTop: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          type="number" inputMode="decimal" value={customRate} onChange={e => onCustomChange(e.target.value)} placeholder="Custom interest" step="0.01" />
                      )}
                    </div>
                  )}

                  {/* Release Date */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
                      <Calendar size={16} />
                      Release Date (Today)
                    </div>
                    <input
                      className="field-input"
                      style={{ width: 'auto', padding: '8px 12px', fontSize: '0.875rem', fontWeight: 600, textAlign: 'right', border: 'none', background: 'transparent' }}
                      type="date"
                      value={releaseDate}
                      onChange={e => onDateChange(e.target.value)}
                    />
                  </div>

                  {calc && (
                    <>
                      {/* Min day rule alert */}
                      {calc.details.minDayRuleApplied && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--warning-bg)', borderRadius: 'var(--radius-sm)', marginTop: 12, fontSize: '0.8125rem', color: 'var(--warning)' }}>
                          <AlertCircle size={16} />
                          Minimum 15-day rule applied ({calc.details.actualDays} → {calc.details.effectiveDays} days)
                        </div>
                      )}

                      {/* Days & Interest */}
                      <div style={{ display: 'flex', gap: 20, marginTop: 16, padding: '14px 0', borderTop: '1px solid var(--border-subtle)' }}>
                        <div>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Days Elapsed</div>
                          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{calc.details.effectiveDays} Days</div>
                        </div>
                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Total Interest</div>
                          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>₹{releaseTotals.baseInterest.toLocaleString('en-IN')}</div>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="detail-row" style={{ padding: '4px 0' }}>
                          <span className="detail-key">Base Interest</span>
                          <span className="detail-val">₹{releaseTotals.baseInterest.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="detail-row" style={{ padding: '4px 0' }}>
                          <span className="detail-key">Part Payment Deduction (Base Only)</span>
                          <span className="detail-val">- ₹{releaseTotals.partPaymentAppliedToBase.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="detail-row" style={{ padding: '4px 0' }}>
                          <span className="detail-key">Base Due After Part Payments</span>
                          <span className="detail-val">₹{releaseTotals.baseFinalAfterPartPayments.toLocaleString('en-IN')}</span>
                        </div>
                        {releaseTotals.postPaymentInterest > 0 && (
                          <div className="detail-row" style={{ padding: '4px 0' }}>
                            <span className="detail-key">Interest After Last Part Payment</span>
                            <span className="detail-val">₹{releaseTotals.postPaymentInterest.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                      </div>

                      {/* Phase expander */}
                      {calc.details.phases.length > 1 && (
                        <>
                          <button
                            className="btn btn-ghost btn-sm btn-full"
                            style={{ marginTop: 8 }}
                            onClick={() => setShowPhases(!showPhases)}
                          >
                            {showPhases ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            {showPhases ? 'Hide' : 'Show'} Phase Details
                          </button>
                          <AnimatePresence>
                            {showPhases && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{ overflow: 'hidden', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}
                              >
                                {calc.details.phases.map(p => (
                                  <div key={p.phase} className="phase-card">
                                    <div className="phase-title">Phase {p.phase}</div>
                                    <div className="detail-row" style={{ padding: '4px 0' }}>
                                      <span className="detail-key">Period</span>
                                      <span className="detail-val" style={{ fontSize: '0.8125rem' }}>{p.startDate} → {p.endDate}</span>
                                    </div>
                                    <div className="detail-row" style={{ padding: '4px 0' }}>
                                      <span className="detail-key">Duration</span>
                                      <span className="detail-val" style={{ fontSize: '0.8125rem' }}>{p.days}d ({p.months})</span>
                                    </div>
                                    <div className="detail-row" style={{ padding: '4px 0' }}>
                                      <span className="detail-key">Rate</span>
                                      <span className="detail-val" style={{ fontSize: '0.8125rem' }}>₹{Number(p.rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="detail-row" style={{ padding: '4px 0' }}>
                                      <span className="detail-key">Interest</span>
                                      <span className="detail-val" style={{ fontSize: '0.8125rem', color: 'var(--warning)' }}>₹{p.interest}</span>
                                    </div>
                                  </div>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </>
                      )}

                      {/* Final Amount */}
                      <div style={{
                        marginTop: 20, padding: '20px 0 0', borderTop: '1px solid var(--border-subtle)',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                          Final Amount to Collect
                        </div>
                        <div style={{ fontSize: '2.25rem', fontWeight: 900, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                          ₹{releaseTotals.finalToCollect.toLocaleString('en-IN')}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* ─── Confirm Button ─── */}
                {calc && (
                  <motion.button
                    className="btn btn-primary btn-lg btn-full"
                    onClick={handleRelease}
                    disabled={releasing}
                    whileTap={{ scale: 0.97 }}
                    style={{ marginBottom: 40, borderRadius: 'var(--radius-xl)', fontSize: '1rem', fontWeight: 700, padding: '18px 32px' }}
                  >
                    {releasing
                      ? <><Loader2 size={20} className="spin" /> Releasing…</>
                      : <><Check size={20} /> Confirm Release & Payment</>
                    }
                  </motion.button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  )
}

const SUPER_BASE_RATES = ['1', '1.15', '1.25'] as const
const NORMAL_BASE_RATES = ['1.5', '2', '3', '5'] as const

const SUPER_RATES = [
  { value: '1', label: '₹1.00' },
  { value: '1.15', label: '₹1.15' },
  { value: '1.25', label: '₹1.25' },
  { value: 'custom', label: 'Custom ₹' }
]

const NORMAL_RATES = [
  { value: '1.5', label: '₹1.50' },
  { value: '2', label: '₹2.00' },
  { value: '3', label: '₹3.00' },
  { value: '5', label: '₹5.00' },
  { value: 'custom', label: 'Custom ₹' }
]

function todayStr() { return new Date().toISOString().split('T')[0] }
function formatDate(d: string) {
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`
}
function daysBetweenStr(a: string, b: string): number {
  return Math.ceil(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24))
}
function nextDay(d: string): string {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + 1)
  return dt.toISOString().split('T')[0]
}

