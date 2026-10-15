// React
import type { ReactElement } from 'react'
// App
import { downloadUrl } from '#src/api/jobs.api'

const FORMATS = [
  { format: 'md', label: 'Markdown (.md)' },
  { format: 'srt', label: 'Subtitles (.srt)' },
  { format: 'txt', label: 'Plain text (.txt)' },
] as const

interface DownloadLinksProps {
  jobId: string
}

export function DownloadLinks( { jobId }: DownloadLinksProps ): ReactElement {
  return (
    <section aria-label="Download transcript">
      <ul>
        { FORMATS.map( ( { format, label } ) => (
          <li key={ format }>
            <a href={ downloadUrl( jobId, format ) } download>{ label }</a>
          </li>
        ) ) }
      </ul>
    </section>
  )
}
