// React
import type { ReactElement } from 'react'
// Packages
import SettingsIcon from '@mui/icons-material/Settings'
import TranscriberIcon from '@mui/icons-material/GraphicEq'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
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

type NavItemProps = {
  label: string
  to: string
  icon: ReactElement
  isSelected: boolean
  isMini: boolean
  onNavigate: ( () => void ) | undefined
}

function NavItem(
  { label, to, icon, isSelected, isMini, onNavigate }: NavItemProps,
): ReactElement {
  return (
    <ListItem disablePadding>
      <Tooltip title={ isMini ? label : '' } placement="right">
        <ListItemButton
          component={ Link }
          to={ to }
          selected={ isSelected }
          aria-current={ isSelected ? 'page' : undefined }
          onClick={ onNavigate }
          sx={ { minHeight: 48, px: 2.5 } }
        >
          <ListItemIcon sx={ { minWidth: 0, mr: isMini ? 0 : 2 } }>{ icon }</ListItemIcon>
          { !isMini && <ListItemText primary={ label } /> }
        </ListItemButton>
      </Tooltip>
    </ListItem>
  )
}

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
  const onNavigate = isNarrow ? onClose : undefined

  const contents = (
    <>
      <Toolbar variant="dense" />
      <List component="nav" aria-label="Main">
        { NAV_ITEMS.map( ( { label, to, icon, isCurrent } ) => (
          <NavItem
            key={ to }
            label={ label }
            to={ to }
            icon={ icon }
            isSelected={ isCurrent( pathname ) }
            isMini={ isMini }
            onNavigate={ onNavigate }
          />
        ) ) }
      </List>
      <Box sx={ { mt: 'auto' } }>
        <Divider />
        <List disablePadding>
          <NavItem
            label="Settings"
            to="/settings"
            icon={ <SettingsIcon /> }
            isSelected={ pathname === '/settings' }
            isMini={ isMini }
            onNavigate={ onNavigate }
          />
        </List>
        <Box sx={ { p: 1 } }>
          <ColorModeControl isCollapsed={ isMini } />
        </Box>
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
