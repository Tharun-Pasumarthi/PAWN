import { Capacitor } from '@capacitor/core'
import type { PawnHistory } from '../types'

function buildCsv(data: PawnHistory[]): string {
  const headers = [
    'serial_number', 'customer_name', 'amount', 'interest_rate',
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

  return [headers.join(','), ...rows].join('\n')
}

export async function exportToCSV(data: PawnHistory[], filename = 'pawn-history.csv'): Promise<void> {
  if (!data.length) return

  const csv = buildCsv(data)

  if (Capacitor.isNativePlatform()) {
    // Native Android: write to Data directory then share via files[] array
    // Using files[] (not url:) makes Capacitor Share handle file:// → content:// conversion internally
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')

    const writeResult = await Filesystem.writeFile({
      path: filename,
      data: csv,
      directory: Directory.Data,
      encoding: Encoding.UTF8
    })

    await Share.share({
      files: [writeResult.uri],
      dialogTitle: 'Save or share CSV'
    })
  } else {
    // Web / Desktop: standard anchor download
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
}
