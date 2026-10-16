// Packages
import { createTheme } from '@mui/material/styles'

// Module augmentation is type-only and erased; the rule only targets runtime namespaces.
// eslint-disable-next-line no-restricted-syntax
declare module '@mui/material/styles' {
  interface CssThemeVariables {
    enabled: true
  }
}

export const theme = createTheme( {
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#1d4ed8', contrastText: '#ffffff' },
        error: { main: '#b42318' },
        success: { main: '#166534' },
        background: { default: '#f4f5f7', paper: '#ffffff' },
        text: { primary: '#1a1d23', secondary: '#475467' },
        divider: '#d0d5dd',
      },
    },
    dark: {
      palette: {
        primary: { main: '#7ea6ff', contrastText: '#0b1220' },
        error: { main: '#ff8a80' },
        success: { main: '#6fd08c' },
        background: { default: '#12141a', paper: '#1c1f27' },
        text: { primary: '#f2f4f7', secondary: '#a4acb9' },
        divider: '#3a3f4b',
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'system-ui, -apple-system, \'Segoe UI\', Roboto, sans-serif',
  },
} )
