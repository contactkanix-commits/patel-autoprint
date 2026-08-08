import React, { useEffect, useState } from 'react';
import { 
  Box, Drawer, AppBar, Toolbar, Typography, List, ListItem, ListItemIcon, ListItemText,
  IconButton, Avatar, Menu, MenuItem, Divider, Badge, useMediaQuery, useTheme,
  Collapse, ListItemButton, Tooltip
} from '@mui/material';
import {
  Menu as MenuIcon, Print as PrintIcon, PhotoCamera as PhotoIcon,
  Description as DescriptionIcon, Chat as ChatIcon, TrendingUp as StatsIcon,
  Settings as SettingsIcon, Menu as MenuOpenIcon, ChevronLeft, Brightness4, Brightness7,
  Notifications as NotificationsIcon, PowerSettingsNew, Help, Person, Logout,
  ExpandLess, ExpandMore
} from '@mui/icons-material';
import { useThemeContext } from '../context/ThemeContext';
import { useAppStore } from '../store/useAppStore';
import { useNavigate, useLocation, Navigate, Outlet } from 'react-router-dom';
import { useNavigate as useReactRouterNavigate } from 'react-router-dom';

const tabs = [
  { id: 'print-queue', label: 'Print Queue', icon: <PrintIcon />, path: '/print-queue' },
  { id: 'passport-photos', label: 'Passport Photos', icon: <PhotoIcon />, path: '/passport-photos' },
  { id: 'aadhaar-pan', label: 'Aadhaar / PAN', icon: <DescriptionIcon />, path: '/aadhaar-pan' },
  { id: 'whatsapp-bot', label: 'WhatsApp Bot', icon: <ChatIcon />, path: '/whatsapp-bot' },
  { id: 'daily-stats', label: 'Daily Stats', icon: <StatsIcon />, path: '/daily-stats' },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

const Layout: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { darkMode, toggleDarkMode } = useThemeContext();
  const { 
    activeTab, setActiveTab, sidebarOpen, setSidebarOpen, 
    settings, agentStatus, agentMessage, unreadCount 
  } = useAppStore();
  const navigate = useReactRouterNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => setSidebarOpen(!sidebarOpen);
  const handleDrawerClose = () => setSidebarOpen(false);

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => setAnchorEl(null);

  const handleLogout = () => {
    handleMenuClose();
    navigate('/login');
  };

  const tabsList = tabs.map((tab) => (
    <ListItemButton
      key={tab.id}
      selected={activeTab === tab.id}
      onClick={() => {
        setActiveTab(tab.id);
        navigate(tab.path);
        if (isMobile) handleDrawerClose();
      }}
      sx={{
        mx: 1, my: 0.5, borderRadius: 2,
        '&.Mui-selected': {
          bgcolor: 'primary.main',
          color: 'white',
          '& .MuiListItemIcon-root': { color: 'white' },
          '&:hover': { bgcolor: 'primary.dark' },
        },
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <ListItemIcon sx={{ minWidth: 40 }}>{tab.icon}</ListItemIcon>
      <ListItemText primary={tab.label} />
    </ListItemButton>
  ));

  const drawer = (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" fontWeight={700} sx={{ color: 'primary.main' }}>
          Patel AutoPrint
        </Typography>
        <Typography variant="caption" color="text.secondary">v1.0</Typography>
      </Box>
      
      <Divider />
      
      <List sx={{ flex: 1, px: 1, py: 1 }}>{tabsList}</List>
      
      <Divider />
      
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
          Agent Status
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Box 
            sx={{ 
              width: 8, height: 8, borderRadius: '50%',
              bgcolor: agentStatus === 'running' ? 'success.main' : 
                       agentStatus === 'starting' ? 'warning.main' : 
                       agentStatus === 'error' ? 'error.main' : 'grey',
              animation: agentStatus === 'running' ? 'pulse 2s infinite' : 'none',
            }} 
          />
          <Typography variant="caption" textTransform="capitalize">
            {agentStatus} {agentStatus === 'running' ? '●' : ''}
          </Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar position="fixed" elevation={1} sx={{ zIndex: 1200 }}>
        <Toolbar>
          {isMobile && (
            <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
              <MenuOpenIcon />
            </IconButton>
          )}
          <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1, display: { xs: 'none', sm: 'block' } }}>
            Patel AutoPrint
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Notifications">
              <IconButton onClick={() => navigate('/notifications')}>
                <Badge badgeContent={useAppStore.getState().unreadCount} color="error">
                  <NotificationsIcon />
                </Badge>
              </IconButton>
            </Tooltip>
            
            <Tooltip title={useAppStore.getState().darkMode ? 'Light mode' : 'Dark mode'}>
              <IconButton onClick={toggleDarkMode}>
                {useAppStore.getState().darkMode ? <Brightness7 /> : <Brightness4 />}
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Menu">
              <IconButton onClick={handleProfileMenuOpen}>
                <Avatar sx={{ width: 32, height: 32 }}>
                  <Person />
                </Avatar>
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>
      
      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={isMobile ? mobileOpen : sidebarOpen}
        onClose={handleDrawerClose}
        sx={{ 
          width: sidebarOpen ? 260 : 72, 
          flexShrink: 0,
          '& .MuiDrawer-paper': { 
            width: sidebarOpen ? 260 : 72, 
            borderRight: 1, 
            borderColor: 'divider',
            backgroundColor: 'background.paper',
          },
        }}
      >
        {drawer}
      </Drawer>
      
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={handleMenuClose}><Person /> Profile</MenuItem>
        <MenuItem onClick={() => { handleMenuClose(); navigate('/settings'); }}><SettingsIcon /> Settings</MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}><Logout /> Logout</MenuItem>
      </Menu>
      
      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: '64px', width: { xs: '100%', sm: `calc(100% - ${sidebarOpen ? 260 : 72}px)` } }}>
        <Outlet />
      </Box>
    </Box>
  );
}

export default Layout;