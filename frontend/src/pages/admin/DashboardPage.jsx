import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
} from '@mui/material';
import {
  ShoppingCart as OrdersIcon,
  PendingActions as PendingIcon,
  Print as PrintingIcon,
  CheckCircle as CompletedIcon,
  AttachMoney as RevenueIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import OrderStatusBadge from '../../components/OrderStatusBadge';

function StatCard({ title, value, icon, color }) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="body2" color="text.secondary">{title}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 600 }}>{value}</Typography>
          </Box>
          <Box sx={{ bgcolor: `${color}.light`, borderRadius: 2, p: 1.5, display: 'flex' }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ total: 0, pending: 0, printing: 0, completed: 0, revenue: 0 });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const result = await api.get('/admin/orders');
      if (result.success) {
        const orders = result.data?.orders || [];
        setRecentOrders(orders.slice(0, 10));
        setStats({
          total: orders.length,
          pending: orders.filter((o) => o.status === 'PENDING').length,
          printing: orders.filter((o) => o.status === 'PRINTING').length,
          completed: orders.filter((o) => o.status === 'COMPLETED').length,
          revenue: orders
            .filter((o) => o.status === 'COMPLETED')
            .reduce((sum, o) => sum + (o.totalPrice || 0), 0),
        });
      }
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Dashboard</Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Total Orders" value={stats.total} icon={<OrdersIcon sx={{ color: 'primary.main' }} />} color="primary" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Pending" value={stats.pending} icon={<PendingIcon sx={{ color: 'warning.main' }} />} color="warning" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Printing" value={stats.printing} icon={<PrintingIcon sx={{ color: 'info.main' }} />} color="info" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Completed" value={stats.completed} icon={<CompletedIcon sx={{ color: 'success.main' }} />} color="success" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Revenue" value={`₹${stats.revenue.toFixed(0)}`} icon={<RevenueIcon sx={{ color: 'success.main' }} />} color="success" />
        </Grid>
      </Grid>

      <Typography variant="h6" gutterBottom>Recent Orders</Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <TableContainer component={Paper}>
          <Table size="small" sx={{ minWidth: 600 }}>
          <TableHead>
            <TableRow>
              <TableCell>Token</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Time</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recentOrders.map((order) => (
              <TableRow
                key={order.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => navigate(`/admin/orders/${order.id}`)}
              >
                <TableCell sx={{ fontWeight: 700 }}>
                  #{order.token || '-'}
                </TableCell>
                <TableCell>{order.customer?.name || 'Walk-in'}</TableCell>
                <TableCell>{order.customer?.phone || '-'}</TableCell>
                <TableCell>₹{order.totalPrice?.toFixed(2)}</TableCell>
                <TableCell><OrderStatusBadge status={order.status} /></TableCell>
                <TableCell>
                  {new Date(order.createdAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </TableCell>
              </TableRow>
            ))}
            {recentOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">No orders yet</TableCell>
              </TableRow>
            )}
          </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}
