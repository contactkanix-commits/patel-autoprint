import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Button,
  Chip,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../services/api';
import OrderStatusBadge from '../../components/OrderStatusBadge';

const statusFilters = [
  { value: '', label: 'All Status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PRINTING', label: 'Printing' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REJECTED', label: 'Rejected' },
];

export default function OrderQueuePage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const navigate = useNavigate();

  const fetchOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);

      const result = await api.get(`/admin/orders?${params.toString()}`);
      if (result.success) {
        setOrders(result.data?.orders || []);
      }
      setLastRefresh(new Date());
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await api.put(`/admin/orders/${orderId}/status`, { status: newStatus });
      toast.success(`Order ${newStatus.toLowerCase()}`);
      fetchOrders();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleReprint = async (orderId) => {
    try {
      await api.post(`/admin/orders/${orderId}/reprint`);
      toast.success('Reprint job sent');
    } catch {
      toast.error('Failed to reprint');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Order Queue</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </Typography>
          <IconButton onClick={fetchOrders} size="small">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search by Token, Name, Phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
        <FormControl sx={{ minWidth: 160 }} size="small">
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {statusFilters.map((f) => (
              <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <TableContainer component={Paper}>
            <Table size="small" sx={{ minWidth: 800 }}>
            <TableHead>
              <TableRow>
                <TableCell>Token</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Files</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Time</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id} hover>
                  <TableCell sx={{ fontWeight: 700, fontSize: 14 }}>
                    #{order.token || '-'}
                  </TableCell>
                  <TableCell>{order.customer?.name || 'Walk-in'}</TableCell>
                  <TableCell>{order.customer?.phone || '-'}</TableCell>
                  <TableCell>{order.files?.length || 0}</TableCell>
                  <TableCell>₹{order.totalPrice?.toFixed(2)}</TableCell>
                  <TableCell>
                    <Chip
                      label={order.paymentMethod || 'N/A'}
                      size="small"
                      variant="outlined"
                      sx={{ textTransform: 'capitalize' }}
                    />
                  </TableCell>
                  <TableCell><OrderStatusBadge status={order.status} /></TableCell>
                  <TableCell>
                    {new Date(order.createdAt).toLocaleString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => navigate(`/admin/orders/${order.id}`)}
                      title="View Details"
                    >
                      <ViewIcon fontSize="small" />
                    </IconButton>
                    {order.status === 'PENDING' && (
                      <>
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleStatusChange(order.id, 'PRINTING')}
                          title="Approve & Print"
                        >
                          <ApproveIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleStatusChange(order.id, 'REJECTED')}
                          title="Reject"
                        >
                          <RejectIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                    {order.status === 'APPROVED' && (
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleStatusChange(order.id, 'PRINTING')}
                        title="Start Printing"
                      >
                        <PrintIcon fontSize="small" />
                      </IconButton>
                    )}
                    {order.status === 'PRINTING' && (
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => handleStatusChange(order.id, 'COMPLETED')}
                        title="Mark Complete"
                      >
                        <ApproveIcon fontSize="small" />
                      </IconButton>
                    )}
                    {order.status === 'COMPLETED' && (
                      <IconButton
                        size="small"
                        color="warning"
                        onClick={() => handleReprint(order.id)}
                        title="Reprint"
                      >
                        <PrintIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center">No orders found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        </Box>
      )}
    </Box>
  );
}
