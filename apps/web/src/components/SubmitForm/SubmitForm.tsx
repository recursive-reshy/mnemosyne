// React
import { useId, useState } from 'react'
import type { ChangeEvent, ReactElement, SyntheticEvent } from 'react'
// Shared
import { CreateJobBody } from '@mnemosyne/shared'

const TEXT = {
  formName: 'Transcribe a video',
  inputLabel: 'Video URL',
  placeholder: 'https://www.youtube.com/watch?v=…',
  submit: 'Transcribe',
  submitting: 'Starting…',
  invalidUrl: 'Enter a video URL starting with http:// or https://',
} as const

interface SubmitFormProps {
  isSubmitting: boolean
  error: string | null
  onSubmit: ( url: string ) => void
}

export function SubmitForm( { isSubmitting, error, onSubmit }: SubmitFormProps ): ReactElement {
  const [ url, setUrl ] = useState( '' )
  const [ validationMessage, setValidationMessage ] = useState< string | null >( null )
  const inputId = useId()
  const messageId = useId()
  const message = validationMessage ?? error

  function handleChange( event: ChangeEvent< HTMLInputElement > ): void {
    setUrl( event.target.value )
    setValidationMessage( null )
  }

  function handleSubmit( event: SyntheticEvent< HTMLFormElement > ): void {
    event.preventDefault()

    const trimmedUrl = url.trim()

    if( !CreateJobBody.safeParse( { url: trimmedUrl } ).success ) {
      setValidationMessage( TEXT.invalidUrl )
      return
    }

    onSubmit( trimmedUrl )
  }

  return (
    <form aria-label={ TEXT.formName } noValidate onSubmit={ handleSubmit }>
      <label htmlFor={ inputId }>{ TEXT.inputLabel }</label>
      <input
        id={ inputId }
        type="url"
        value={ url }
        placeholder={ TEXT.placeholder }
        autoComplete="off"
        disabled={ isSubmitting }
        aria-invalid={ validationMessage ? true : undefined }
        aria-describedby={ message ? messageId : undefined }
        onChange={ handleChange }
      />
      <button type="submit" disabled={ isSubmitting }>
        { isSubmitting ? TEXT.submitting : TEXT.submit }
      </button>
      { message && <p id={ messageId } role="alert">{ message }</p> }
    </form>
  )
}
