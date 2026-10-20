// React
import type { ReactElement } from 'react'
// Packages
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
// Shared
import type { GmailDestination } from '@mnemosyne/shared'

interface GmailDestinationFieldProps {
  id: string
  value: GmailDestination
  onChange: ( destination: GmailDestination ) => void
}

export function GmailDestinationField(
  { id, value, onChange }: GmailDestinationFieldProps,
): ReactElement {
  return (
    <FormControl>
      <FormLabel id={ `${ id }-destination` }>Destination</FormLabel>
      <RadioGroup
        row
        aria-labelledby={ `${ id }-destination` }
        value={ value }
        onChange={ ( event ) => onChange( event.target.value === 'jobs' ? 'jobs' : 'newsletter' ) }
      >
        <FormControlLabel value="newsletter" control={ <Radio /> } label="Newsletter" />
        <FormControlLabel value="jobs" control={ <Radio /> } label="Freelance jobs" />
      </RadioGroup>
    </FormControl>
  )
}
