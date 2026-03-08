import type { PawnHistory } from '../types'

export function exportToCSV(data: PawnHistory[], filename = 'pawn-history.csv'): void {
  if (!data.length) return

  const headers = [
    'serial_number', 'amount', 'interest_rate',
    'pledge_date', 'release_date', 'total_interest', 'final_amount'
  ]

  const rows = data.map(row =>
    headers.map(h => {
      const val = String(row[h as keyof PawnHistory] ?? '')
      return val.includes(',') || val.includes('"')
        ? `"${val.replace(/"/g, '""')}"`
        : val
    }).join(',')
  )

  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
