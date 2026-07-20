import { useState } from 'react';
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Grid,
  Divider,
  CircularProgress,
  Card,
  CardContent,
} from '@mui/material';
import { Search, Receipt } from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../services/api';
import OrderStatusBadge from '../components/OrderStatusBadge';

export default function OrderTracking() {
  const [orderId, setOrderId] = useState('');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!orderId.trim()) {
      toast.error('Please enter an order ID');
      return;
    }
    setLoading(true);
    setOrder(null);
    try {
      const result = await api.get(`/guest/orders/${orderId.trim()}`);
      if (result.success) {
        setOrder(result.data);
      }
    } catch {
      toast.error('Order not found');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 700 }}>
        Track Your Order
      </Typography>
      <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 4 }}>
        Enter your order ID to check the status
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
        <TextField
          fullWidth
          label="Order ID"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          placeholder="Enter your order ID"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button
          variant="contained"
          onClick={handleSearch}
          disabled={loading}
          sx={{ minWidth: 120 }}
          startIcon={loading ? <CircularProgress size={20} /> : <Search />}
        >
          Track
        </Button>
      </Box>

      {order && (
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Receipt sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6">Order Details</Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />

          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Order ID</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                {order.id}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Status</Typography>
              <OrderStatusBadge status={order.status} />
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Customer</Typography>
              <Typography variant="body1">{order.customer?.name || 'Walk-in'}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Phone</Typography>
              <Typography variant="body1">{order.customer?.phone || '-'}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Payment</Typography>
              <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>{order.paymentMethod || 'N/A'}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Total</Typography>
              <Typography variant="body1" color="primary" fontWeight={600}>{'\u20B9'}{order.totalPrice?.toFixed(2)}</Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" gutterBottom>Files</Typography>
              {order.files?.map((file, i) => (
                <Typography key={file.id || i} variant="body2">
                  - {file.originalName} ({file.pageCount} pages)
                </Typography>
              ))}
            </Grid>
          </Grid>
        </Paper>
      )}
    </Container>
  );
}
