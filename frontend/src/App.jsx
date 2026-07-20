import { Routes, Route, Link } from 'react-router-dom';
import { Box, Button, Container, Typography, Paper } from '@mui/material';
import { ShoppingCart, TrackChanges, AdminPanelSettings } from '@mui/icons-material';
import { useAuth } from './contexts/AuthContext';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CustomerPortal from './pages/CustomerPortal';
import OrderTracking from './pages/OrderTracking';
import AdminLayout from './pages/admin/AdminLayout';
import DashboardPage from './pages/admin/DashboardPage';
import OrderQueuePage from './pages/admin/OrderQueuePage';
import OrderDetailPage from './pages/admin/OrderDetailPage';
import PrintersPage from './pages/admin/PrintersPage';
import SettingsPage from './pages/admin/SettingsPage';

function HomePage() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, sm: 8 }, px: { xs: 1.5, sm: 3 } }}>
      <Typography variant="h3" align="center" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.8rem', sm: '2.5rem', md: '3rem' } }}>
        Patel AutoPrint
      </Typography>
      <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: { xs: 3, sm: 6 }, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
        Professional Print Shop - Quick & Easy
      </Typography>

      <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Paper
          elevation={2}
          sx={{
            p: 4,
            textAlign: 'center',
            width: { xs: '100%', sm: 280 },
            cursor: 'pointer',
            transition: '0.2s',
            '&:hover': { elevation: 6, transform: 'translateY(-4px)' },
          }}
          component={Link}
          to="/portal"
        >
          <ShoppingCart sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6">Print Documents</Typography>
          <Typography variant="body2" color="text.secondary">
            Upload files, configure settings, and place your print order
          </Typography>
        </Paper>

        <Paper
          elevation={2}
          sx={{
            p: 4,
            textAlign: 'center',
            width: { xs: '100%', sm: 280 },
            cursor: 'pointer',
            transition: '0.2s',
            '&:hover': { elevation: 6, transform: 'translateY(-4px)' },
          }}
          component={Link}
          to="/tracking"
        >
          <TrackChanges sx={{ fontSize: 48, color: 'secondary.main', mb: 2 }} />
          <Typography variant="h6">Track Order</Typography>
          <Typography variant="body2" color="text.secondary">
            Check the status of your existing print order
          </Typography>
        </Paper>

        <Paper
          elevation={2}
          sx={{
            p: 4,
            textAlign: 'center',
            width: { xs: '100%', sm: 280 },
            cursor: 'pointer',
            transition: '0.2s',
            '&:hover': { elevation: 6, transform: 'translateY(-4px)' },
          }}
          component={Link}
          to="/login"
        >
          <AdminPanelSettings sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6">Admin Panel</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage orders, printers, and pricing (Login required)
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
}

function AdminProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  if (!isAuthenticated) {
    window.location.href = '/login';
    return null;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/portal" element={<CustomerPortal />} />
      <Route path="/tracking" element={<OrderTracking />} />
      <Route
        path="/admin"
        element={
          <AdminProtectedRoute>
            <AdminLayout />
          </AdminProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="orders" element={<OrderQueuePage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="printers" element={<PrintersPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
