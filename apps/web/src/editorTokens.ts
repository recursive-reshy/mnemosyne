// Packages
import type { Theme } from '@mui/material/styles'

// The note editor's CSS module (NoteEditor.module.css) still reads these three tokens from the
// old global.css. Remove this file when the editor is replaced or restyled in v0.3.2.
export const editorTokens = ( theme: Theme ): Record< ':root', Record< string, string > > => ( {
  ':root': {
    '--color-border': theme.vars.palette.divider,
    '--space-1': theme.spacing( 0.5 ),
    '--space-2': theme.spacing( 1 ),
  },
} )
