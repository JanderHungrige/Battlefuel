// Info Docs tab helpers (v2 Wave 11 F8). The served PDF filenames come from
// /docs/manifest.json (written by sync-assets); these pure helpers derive a readable title
// and a group for each so the panel can list them grouped. Kept pure for unit testing.

export interface DocEntry {
  file: string
  title: string
  url: string
}

export interface DocGroup {
  group: string
  docs: DocEntry[]
}

/** A readable title from a PDF filename: strip extension, split separators, tidy NATO codes. */
export function docTitle(file: string): string {
  const base = file.replace(/\.pdf$/i, '')
  const words = base.split(/[_\-\s]+/).filter(Boolean)
  return words
    .map((w) => {
      // Keep all-caps tokens / numbers as-is (AJP, UK, NE, 4, A1); title-case the rest.
      if (/^[A-Z0-9]+$/.test(w)) return w
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
}

/** Group an AJP doctrine document vs other documents (the folder may hold non-logistics docs). */
export function docGroup(file: string): string {
  return /^ajp/i.test(file) ? 'NATO logistics doctrine (AJP)' : 'Other documents'
}

/** Build grouped, sorted doc entries from the manifest filename list. */
export function groupDocs(files: string[]): DocGroup[] {
  const byGroup = new Map<string, DocEntry[]>()
  for (const file of files) {
    const entry: DocEntry = { file, title: docTitle(file), url: `/docs/${encodeURIComponent(file)}` }
    const g = docGroup(file)
    const list = byGroup.get(g) ?? []
    list.push(entry)
    byGroup.set(g, list)
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, docs]) => ({
      group,
      docs: docs.sort((a, b) => a.title.localeCompare(b.title)),
    }))
}
