function cell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const head = headers.join(',')
  const body = rows.map((r) => r.map(cell).join(',')).join('\r\n')
  return body ? `${head}\r\n${body}` : head
}
