import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Tabs,
  Tab,
  Button,
  Avatar,
  Chip,
  Alert,
  AlertTitle,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  ShoppingCart as OrdersIcon,
  Print as PrintIcon,
  Assessment as AssessmentIcon,
  Logout as LogoutIcon,
  SettingsRemote as AgentIcon,
  WarningAmber as WarningIcon,
  Block as BlockIcon,
} from '@mui/icons-material';
import { useAuth } from '../../AuthContext';
import { useEffect, useState } from 'react';

const tabs = [
  { label: 'Dashboard', icon: <DashboardIcon />, path: '/admin' },
  { label: 'Orders', icon: <OrdersIcon />, path: '/admin/orders' },
  { label: 'Printers', icon: <PrintIcon />, path: '/admin/printers' },
  { label: 'Pricing', icon: <AssessmentIcon />, path: '/admin/settings' },
  { label: 'Agent', icon: <AgentIcon />, path: '/admin/agent' },
];

function SubscriptionBanner({ subscription }) {
  if (!subscription) return null;
  const { active, status, daysLeft, endDate } = subscription;

  if (!active) {
    const reason =
      status === 'SUSPENDED'
        ? 'Your shop subscription has been suspended.'
        : status === 'CANCELLED'
        ? 'Your shop subscription has been cancelled.'
        : 'Your shop subscription has expired.';
    return (
      <Alert
        severity="error"
        icon={<BlockIcon />}
        sx={{ borderRadius: 0 }}
      >
        <AlertTitle>Printing blocked</AlertTitle>
        {reason} Printing has been disabled. Contact Patel AutoPrint to renew your subscription.
      </Alert>
    );
  }

  if (daysLeft !== null && daysLeft !== undefined && daysLeft <= 5) {
    return (
      <Alert
        severity="warning"
        icon={<WarningIcon />}
        sx={{ borderRadius: 0 }}
      >
        <AlertTitle>Subscription expiring soon</AlertTitle>
        Your subscription ends {daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`}
        {endDate ? ` (${new Date(endDate).toLocaleDateString()})` : ''}. Renew to keep printing.
      </Alert>
    );
  }

  return null;
}

export default function AdminLayout() {
  const { user, logout, subscription } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [agentRunning, setAgentRunning] = useState(null);

  useEffect(() => {
    if (window.patelApp?.agent) {
      window.patelApp.agent.getStatus().then((s) => setAgentRunning(s?.status === 'running'));
      const unsub = window.patelApp.agent.onStatus((s) => setAgentRunning(s?.status === 'running'));
      return unsub;
    }
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const activeIndex = tabs.findIndex((t) =>
    t.path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(t.path)
  );

  const handleTabChange = (_, index) => {
    navigate(tabs[index].path);
  };

  const subscriptionBlocked = !!subscription && !subscription.active;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', pt: '64px' }}>
      <AppBar position="fixed">
        <Toolbar sx={{ gap: 2 }}>
          <Avatar sx={{ bgcolor: 'primary.dark' }}>
            {user?.name?.[0]?.toUpperCase() || 'A'}
          </Avatar>
          <Typography variant="h6" noWrap sx={{ mr: 3 }}>
            Patel AutoPrint
          </Typography>
          {agentRunning !== null && (
            <Chip
              icon={<span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: subscriptionBlocked ? '#f44336' : agentRunning ? '#4caf50' : '#9e9e9e', marginLeft: 8 }} />}
              label={subscriptionBlocked ? 'Agent BLOCKED' : agentRunning ? 'Agent ON' : 'Agent OFF'}
              size="small"
              sx={{
                color: 'inherit',
                bgcolor: 'rgba(255,255,255,0.16)',
                '& .MuiChip-label': { color: 'white' },
                mr: 1,
              }}
            />
          )}
          <Tabs
            value={activeIndex < 0 ? 0 : activeIndex}
            onChange={handleTabChange}
            textColor="inherit"
            sx={{
              flexGrow: 1,
              '& .MuiTabs-indicator': { backgroundColor: 'white' },
            }}
          >
            {tabs.map((t) => (
              <Tab key={t.label} icon={t.icon} iconPosition="start" label={t.label} sx={{ minWidth: 120 }} />
            ))}
          </Tabs>
          <Button color="inherit" startIcon={<LogoutIcon />} onClick={handleLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <SubscriptionBanner subscription={subscription} />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          p: { xs: 2, sm: 3 },
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
