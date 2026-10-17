// React
import { useId, useState } from 'react'
import type { ChangeEvent, ReactElement, SyntheticEvent } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
// Shared
import { CreateJobBody } from '@mnemosyne/shared'
// App
import { SummaryOptions } from '../SummaryOptions'
import type { SummaryOptionsProps } from '../SummaryOptions'

const TEXT = {
  formName: 'Transcribe a video',
  inputLabel: 'Video URL',
  placeholder: 'https://www.youtube.com/watch?v=…',
  submit: 'Transcribe',
  submitting: 'Starting…',
  invalidUrl: 'Enter a video URL starting with http:// or https://',
} as const

// As in 0.3.0: a disabled button still takes the pointer and shows not-allowed.
const SUBMIT_SX = {
  alignSelf: 'flex-start',
  '&.Mui-disabled': { pointerEvents: 'auto', cursor: 'not-allowed' },
} as const

interface SubmitFormProps {
  isSubmitting: boolean
  error: string | null
  onSubmit: ( url: string ) => void
  options?: SummaryOptionsProps
}

export function SubmitForm(
  { isSubmitting, error, onSubmit, options }: SubmitFormProps,
): ReactElement {
  const [ url, setUrl ] = useState( '' )
  const [ validationMessage, setValidationMessage ] = useState< string | null >( null )
  const messageId = useId()
  const message = validationMessage ?? error

  const handleChange = ( event: ChangeEvent< HTMLInputElement > ): void => {
    setUrl( event.target.value )
    setValidationMessage( null )
  }

  const handleSubmit = ( event: SyntheticEvent< HTMLFormElement > ): void => {
    event.preventDefault()

    const trimmedUrl = url.trim()

    if( !CreateJobBody.safeParse( { url: trimmedUrl } ).success ) {
      setValidationMessage( TEXT.invalidUrl )
      return
    }

    onSubmit( trimmedUrl )
  }

  return (
    <Box
      component="form"
      aria-label={ TEXT.formName }
      noValidate
      onSubmit={ handleSubmit }
      sx={ { display: 'flex', flexDirection: 'column', gap: 1, width: '100%' } }
    >
      <TextField
        label={ TEXT.inputLabel }
        type="url"
        value={ url }
        placeholder={ TEXT.placeholder }
        autoComplete="off"
        fullWidth
        disabled={ isSubmitting }
        error={ validationMessage !== null }
        onChange={ handleChange }
        slotProps={ {
          htmlInput: { 'aria-describedby': message ? messageId : undefined },
          inputLabel: { shrink: true },
        } }
      />
      { options !== undefined && <SummaryOptions { ...options } /> }
      <Button
        type="submit"
        variant="contained"
        disabled={ isSubmitting }
        sx={ SUBMIT_SX }
      >
        { isSubmitting ? TEXT.submitting : TEXT.submit }
      </Button>
      { message && <Alert severity="error" id={ messageId }>{ message }</Alert> }
    </Box>
  )
}
