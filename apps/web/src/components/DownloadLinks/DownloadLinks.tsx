// React
import type { ReactElement } from 'react'
// App
import { downloadUrl } from '#src/api/jobs.api'
import styles from './DownloadLinks.module.css'

const FORMATS = [
  { format: 'md', label: 'Markdown (.md)' },
  { format: 'srt', label: 'Subtitles (.srt)' },
  { format: 'txt', label: 'Plain text (.txt)' },
] as const

const LINK_CLASSES = {
  md: `${ styles.link } ${ styles.primaryLink }`,
  srt: styles.link,
  txt: styles.link,
} as const

interface DownloadLinksProps {
  jobId: string
}

export function DownloadLinks( { jobId }: DownloadLinksProps ): ReactElement {
  return (
    <section className={ styles.section } aria-label="Download transcript">
      <ul className={ styles.list }>
        { FORMATS.map( ( { format, label } ) => (
          <li key={ format }>
            <a
              className={ LINK_CLASSES[ format ] }
              href={ downloadUrl( jobId, format ) }
              download
            >
              { label }
            </a>
          </li>
        ) ) }
      </ul>
    </section>
  )
}
