// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import ArticleIcon from '@mui/icons-material/Article'
import ClearIcon from '@mui/icons-material/Clear'
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo'
import SummarizeIcon from '@mui/icons-material/Summarize'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { FeedItem } from '@mnemosyne/shared'
// App
import { formatDate } from '#src/formatDate'
import { useDismissFeedItems } from '#src/hooks/useDismissFeedItems'
import { useFeedInbox } from '#src/hooks/useFeedInbox'
import { useSummarizeFeedItems } from '#src/hooks/useSummarizeFeedItems'
import { SummarizeItemsDialog } from '../SummarizeItemsDialog'

const ITEM_SX = {
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.25rem 0.75rem',
  px: 1,
  py: 0.5,
  border: 1,
  borderColor: 'divider',
  borderRadius: 1,
} as const

const LIST_SX = { display: 'flex', flexDirection: 'column', gap: 1 } as const

const LINK_SX = { flex: '1 1 12rem', overflowWrap: 'anywhere' } as const

const itemDate = ( { published_at, added_at }: FeedItem ): string => {
  return formatDate( published_at ?? added_at )
}

export function FeedInbox(): ReactElement | null {
  const { items } = useFeedInbox()
  const dismiss = useDismissFeedItems()
  const summarize = useSummarizeFeedItems()
  const [ selected, setSelected ] = useState< string[] >( [] )
  const [ summarizeIds, setSummarizeIds ] = useState< string[] | null >( null )

  if( items.length === 0 ) {
    return null
  }

  const selectedIds = items.map( ( { id } ) => id ).filter( ( id ) => selected.includes( id ) )
  const hasSelection = selectedIds.length > 0
  const isAllSelected = selectedIds.length === items.length

  const handleToggle = ( id: string ): void => {
    setSelected( selectedIds.includes( id )
      ? selectedIds.filter( ( other ) => other !== id )
      : [ ...selectedIds, id ] )
  }

  const handleDismiss = ( ids: string[] ): void => {
    dismiss.mutate( ids, { onSuccess: () => setSelected( [] ) } )
  }

  const handleCloseDialog = (): void => {
    setSummarizeIds( null )
    summarize.reset()
  }

  return (
    <Stack component="section" spacing={ 1 } aria-labelledby="feed-inbox-heading">
      <Typography id="feed-inbox-heading" variant="h6" component="h3">
        { `From feeds (${ items.length })` }
      </Typography>
      <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'center' } }>
        <Checkbox
          slotProps={ { input: { 'aria-label': 'Select all' } } }
          checked={ isAllSelected }
          indeterminate={ hasSelection && !isAllSelected }
          onChange={ () => setSelected( isAllSelected ? [] : items.map( ( { id } ) => id ) ) }
        />
        <Button
          size="small"
          variant="contained"
          disabled={ !hasSelection }
          onClick={ () => setSummarizeIds( selectedIds ) }
        >
          Summarize selected
        </Button>
        <Button
          size="small"
          disabled={ !hasSelection || dismiss.isPending }
          onClick={ () => handleDismiss( selectedIds ) }
        >
          Dismiss selected
        </Button>
      </Stack>
      { dismiss.isError && <Alert severity="error">{ dismiss.error.message }</Alert> }
      <List aria-label="Feed items" disablePadding sx={ LIST_SX }>
        { items.map( ( item ) => (
          <ListItem key={ item.id } sx={ ITEM_SX }>
            <Checkbox
              slotProps={ { input: { 'aria-label': `Select ${ item.title }` } } }
              checked={ selectedIds.includes( item.id ) }
              onChange={ () => handleToggle( item.id ) }
            />
            { item.source_type === 'article'
              ? <ArticleIcon fontSize="small" titleAccess="Article" color="action" />
              : <OndemandVideoIcon fontSize="small" titleAccess="Video" color="action" /> }
            <Link href={ item.link } target="_blank" rel="noopener noreferrer" sx={ LINK_SX }>
              { item.title }
            </Link>
            <Typography component="span" variant="body2" color="text.secondary">
              { item.feed_name }
            </Typography>
            <Typography component="span" variant="body2" color="text.secondary">
              { itemDate( item ) }
            </Typography>
            <IconButton
              size="small"
              aria-label={ `Summarize ${ item.title }` }
              onClick={ () => setSummarizeIds( [ item.id ] ) }
            >
              <SummarizeIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label={ `Dismiss ${ item.title }` }
              onClick={ () => handleDismiss( [ item.id ] ) }
            >
              <ClearIcon fontSize="small" />
            </IconButton>
          </ListItem>
        ) ) }
      </List>
      { summarizeIds !== null && (
        <SummarizeItemsDialog
          count={ summarizeIds.length }
          isSubmitting={ summarize.isPending }
          error={ summarize.error?.message ?? null }
          onSubmit={ ( choices ) => {
            summarize.mutate( { ids: summarizeIds, ...choices }, {
              onSuccess: () => {
                setSelected( [] )
                handleCloseDialog()
              },
            } )
          } }
          onCancel={ handleCloseDialog }
        />
      ) }
    </Stack>
  )
}
