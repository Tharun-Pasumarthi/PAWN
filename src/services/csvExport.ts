import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { PawnHistory } from '../types'

const CSV_HEADERS = [
  'serial_number', 'customer_name', 'amount', 'interest_rate',
  'pledge_date', 'release_date', 'total_interest', 'final_amount'
] as const

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '')
  const mustQuote = /[",\n\r]/.test(text)
  return mustQuote ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsvFilename(filename: string): string {
  const trimmed = filename.trim() || 'pawn-history.csv'
  return trimmed.toLowerCase().endsWith('.csv') ? trimmed : `${trimmed}.csv`
}

function timestampedFilename(filename: string): string {
  const safe = toCsvFilename(filename)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dot = safe.lastIndexOf('.')
  if (dot === -1) return `${safe}-${stamp}`
  return `${safe.slice(0, dot)}-${stamp}${safe.slice(dot)}`
}

function buildCsv(data: PawnHistory[]): string {
  const rows = data.map(row =>
    CSV_HEADERS.map(h => escapeCsvCell(row[h as keyof PawnHistory])).join(',')
  )

  return [CSV_HEADERS.join(','), ...rows].join('\n')
}

async function resolveExportDirectory(): Promise<Directory> {
  try {
    const permissions = await Filesystem.checkPermissions()
    if (permissions.publicStorage !== 'granted') {
      const request = await Filesystem.requestPermissions()
      if (request.publicStorage !== 'granted') return Directory.Data
    }
    return Directory.Documents
  } catch {
    return Directory.Data
  }
}

async function shareCsv(uri: string): Promise<boolean> {
  try {
    const canShare = await Share.canShare()
    if (!canShare.value) return false
    await Share.share({
      title: 'PawnVault CSV Export',
      text: 'PawnVault history export',
      url: uri,
      files: [uri],
      dialogTitle: 'Share CSV'
    })
    return true
  } catch {
    return false
  }
}

async function saveCsvOnNative(csv: string, filename: string): Promise<{ uri: string; location: string }> {
  const exportName = timestampedFilename(filename)
  const exportPath = `exports/${exportName}`
  const directory = await resolveExportDirectory()

  await Filesystem.writeFile({
    path: exportPath,
    data: csv,
    directory,
    encoding: Encoding.UTF8,
    recursive: true
  })

  const { uri } = await Filesystem.getUri({
    directory,
    path: exportPath
  })

  const location = directory === Directory.Documents ? 'Documents' : 'app storage'
  return { uri, location }
}

function downloadCsvOnWeb(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportToCSV(data: PawnHistory[], filename = 'pawn-history.csv'): Promise<string> {
  if (!data.length) return 'No data to export'

  try {
    // Add UTF-8 BOM so Excel opens Unicode characters (e.g. rupee sign) correctly.
    const csv = `\uFEFF${buildCsv(data)}`
    const normalizedFilename = toCsvFilename(filename)

    if (Capacitor.isNativePlatform()) {
      const { uri, location } = await saveCsvOnNative(csv, normalizedFilename)
      const shared = await shareCsv(uri)
      if (shared) return 'CSV ready to share'
      return `CSV saved to ${location} (${uri})`
    }

    downloadCsvOnWeb(csv, normalizedFilename)
    return 'CSV download started'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Export failed: ${message}`)
  }
}
