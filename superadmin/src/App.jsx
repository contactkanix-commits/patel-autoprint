import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ShopDetail from './pages/ShopDetail';

function RequireAuth({ children }) {
  const token = localStorage.getItem('superadmin_token');
  const user = localStorage.getItem('superadmin_user');
  const location = useLocation();
  if (!token || !user) {
    return <Navigate to="/superadmin/login" state={{ from: location }} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/superadmin/login" element={<Login />} />
      <Route
        path="/superadmin"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/superadmin/shops/:id"
        element={
          <RequireAuth>
            <ShopDetail />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/superadmin" replace />} />
    </Routes>
  );
}
