// Shared
import {
  TranscriptMeta,
  applyLockedProperties,
  formatClock,
  serializeNote,
} from '@mnemosyne/shared'

interface NoteInput {
  title: string
  tags: string[]
  body: string
  meta: TranscriptMeta
  created: string
}

export const formatNote = ( { title, tags, body, meta, created }: NoteInput ): string => {
  const locked = {
    source: meta.source,
    channel: meta.channel,
    duration: formatClock( meta.duration_seconds ),
    created,
  }

  return serializeNote( applyLockedProperties(
    { properties: { title, ...locked, tags }, body: `${ body.trim() }\n` },
    locked,
  ) )
}
