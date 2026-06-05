// Info Docs panel (v2 Wave 11 F8): lists the official logistic PDFs (served from /docs/) grouped
// by kind. Each entry opens the PDF in a new tab.

import type { DocGroup } from '../lib/infoDocs'

export interface InfoDocsPanelProps {
  groups: DocGroup[]
  onClose: () => void
}

export function InfoDocsPanel({ groups, onClose }: InfoDocsPanelProps) {
  return (
    <aside className="info-docs-panel" data-testid="info-docs-panel">
      <div className="info-docs-head">
        <h2>Info docs</h2>
        <button type="button" className="ghost" data-testid="info-docs-close" onClick={onClose}>
          Close
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="info-docs-empty" data-testid="info-docs-empty">
          No documents available.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.group} className="info-docs-group">
            <h3>{g.group}</h3>
            <ul className="info-docs-list">
              {g.docs.map((d) => (
                <li key={d.file}>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="info-doc-link"
                  >
                    {d.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </aside>
  )
}
