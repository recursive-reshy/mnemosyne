// React
import type { ReactElement } from 'react'
// Packages
import TranscriberIcon from '@mui/icons-material/GraphicEq'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import { Link, useLocation } from 'react-router'
// App
import { ColorModeControl } from '../ColorModeControl'

export const DRAWER_WIDTH = 240
export const MINI_DRAWER_WIDTH = 64

const NAV_ITEMS = [
  {
    label: 'Transcriber',
    to: '/',
    icon: <TranscriberIcon />,
    isCurrent: ( pathname: string ): boolean => (
      pathname === '/' || pathname.startsWith( '/jobs/' )
    ),
  },
] as const

type NavDrawerProps = {
  id: string
  isNarrow: boolean
  isExpanded: boolean
  isOpen: boolean
  onClose: () => void
}

export function NavDrawer(
  { id, isNarrow, isExpanded, isOpen, onClose }: NavDrawerProps,
): ReactElement {
  const { pathname } = useLocation()
  const isMini = !isNarrow && !isExpanded
  const width = isMini ? MINI_DRAWER_WIDTH : DRAWER_WIDTH

  const contents = (
    <>
      <Toolbar variant="dense" />
      <List component="nav" aria-label="Main">
        { NAV_ITEMS.map( ( { label, to, icon, isCurrent } ) => {
          const isSelected = isCurrent( pathname )

          return (
            <ListItem key={ to } disablePadding>
              <Tooltip title={ isMini ? label : '' } placement="right">
                <ListItemButton
                  component={ Link }
                  to={ to }
                  selected={ isSelected }
                  aria-current={ isSelected ? 'page' : undefined }
                  onClick={ isNarrow ? onClose : undefined }
                  sx={ { minHeight: 48, px: 2.5 } }
                >
                  <ListItemIcon sx={ { minWidth: 0, mr: isMini ? 0 : 2 } }>{ icon }</ListItemIcon>
                  { !isMini && <ListItemText primary={ label } /> }
                </ListItemButton>
              </Tooltip>
            </ListItem>
          )
        } ) }
      </List>
      <Box sx={ { mt: 'auto', p: 1 } }>
        <ColorModeControl isCollapsed={ isMini } />
      </Box>
    </>
  )

  if( isNarrow ) {
    return (
      <Drawer
        id={ id }
        variant="temporary"
        open={ isOpen }
        onClose={ onClose }
        slotProps={ { paper: { sx: { width: DRAWER_WIDTH } } } }
      >
        { contents }
      </Drawer>
    )
  }

  return (
    <Drawer
      id={ id }
      variant="permanent"
      sx={ { width, flexShrink: 0 } }
      slotProps={ { paper: { sx: { width, overflowX: 'hidden' } } } }
    >
      { contents }
    </Drawer>
  )
}
