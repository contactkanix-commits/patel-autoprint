import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useAuth } from './AuthContext';

import LoginPage from './pages/LoginPage';
import AdminLayout from './pages/admin/AdminLayout';
import DashboardPage from './pages/admin/DashboardPage';
import OrderQueuePage from './pages/admin/OrderQueuePage';
import OrderDetailPage from './pages/admin/OrderDetailPage';
import PrintersPage from './pages/admin/PrintersPage';
import SettingsPage from './pages/admin/SettingsPage';
import AgentPage from './pages/admin/AgentPage';

function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="orders" element={<OrderQueuePage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="printers" element={<PrintersPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="agent" element={<AgentPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
