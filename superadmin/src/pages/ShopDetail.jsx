import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Toolbar,
  Tooltip,
  Typography,
  Alert,
  Paper,
  Divider,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Store as StoreIcon,
  VpnKey as VpnKeyIcon,
  Refresh as RefreshIcon,
  ReceiptLong as OrdersIcon,
  Print as PrintersIcon,
  People as UsersIcon,
  Description as JobsIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../api';
import ShopFormDialog from '../components/ShopFormDialog';

const STATUS_COLORS = {
  ACTIVE: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'error',
  SUSPENDED: 'error',
  CANCELLED: 'default',
};

export default function ShopDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/superadmin/shops/${id}`);
      setShop(res.data);
    } catch (err) {
      // interceptor handles
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const copyKey = () => {
    navigator.clipboard?.writeText(shop.agentKey);
    toast.success('Agent key copied');
  };

  const regenerateKey = async () => {
    setRegenerating(true);
    try {
      const res = await api.post(`/superadmin/shops/${id}/regenerate-key`);
      toast.success('Agent key rotated');
      copyKey(res.data.agentKey);
      load();
    } catch (err) {
      // interceptor handles
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/superadmin/shops/${id}`);
      toast.success('Shop deleted');
      navigate('/superadmin', { replace: true });
    } catch (err) {
      // interceptor handles
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !shop) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!shop) return null;

  const sub = shop.subStatus || {};
  const counts = shop._count || {};

  return (
    <Box>
      <Toolbar sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', gap: 1 }}>
        <IconButton onClick={() => navigate('/superadmin')}>
          <BackIcon />
        </IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {shop.name}
        </Typography>
        <Button startIcon={<StoreIcon />} onClick={() => setEditOpen(true)}>
          Edit
        </Button>
        <Button color="error" variant="outlined" onClick={() => setDeleteOpen(true)}>
          Delete
        </Button>
      </Toolbar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <VpnKeyIcon color="primary" />
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    Agent Key
                  </Typography>
                  <Tooltip title="Copy">
                    <IconButton onClick={copyKey}>
                      <VpnKeyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Rotate key (old key stops working)">
                    <span>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={regenerating ? <CircularProgress size={14} /> : <RefreshIcon />}
                        onClick={regenerateKey}
                        disabled={regenerating}
                      >
                        Regenerate
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>
                <Typography variant="h5" fontFamily="monospace" letterSpacing={1}>
                  {shop.agentKey}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Used by the desktop app for one-time activation. Rotating the key disables all existing activations.
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Recent Print Jobs
                </Typography>
                <TableContainer component={Paper} elevation={0}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Paper</TableCell>
                        <TableCell>Mode</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(shop.recentJobs || []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                            No print jobs yet
                          </TableCell>
                        </TableRow>
                      )}
                      {(shop.recentJobs || []).map((j) => (
                        <TableRow key={j.id}>
                          <TableCell>
                            <Typography variant="body2" fontFamily="monospace" fontSize={12}>
                              {j.id.slice(0, 8)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={j.status} variant="outlined" />
                          </TableCell>
                          <TableCell>{j.paperSize}</TableCell>
                          <TableCell>{j.colorMode}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={5}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="h6">Subscription</Typography>
                  <Chip label={sub.plan} color="primary" variant="outlined" />
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Chip size="small" label={sub.status} color={STATUS_COLORS[sub.status] || 'default'} variant="outlined" />
                  {sub.daysLeft !== null && sub.daysLeft !== undefined && (
                    <Chip size="small" label={`${sub.daysLeft} days left`} color={sub.daysLeft <= 5 ? 'warning' : 'default'} variant="outlined" />
                  )}
                </Stack>
                <Divider sx={{ my: 2 }} />
                <Stack spacing={1}>
                  <Typography variant="body2">
                    <strong>Price:</strong> ₹{sub.price?.toLocaleString?.('en-IN') ?? sub.price ?? 0}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Ends:</strong> {sub.endDate ? new Date(sub.endDate).toLocaleDateString() : 'Lifetime'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Max printers:</strong> {sub.maxPrinters ?? 1}
                  </Typography>
                </Stack>
                {sub.status !== 'ACTIVE' && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {sub.status === 'EXPIRED' && 'Subscription has expired — printing is blocked.'}
                    {sub.status === 'SUSPENDED' && 'Shop is suspended — printing is blocked.'}
                    {sub.status === 'CANCELLED' && 'Subscription cancelled — printing is blocked.'}
                  </Alert>
                )}
                {sub.status === 'ACTIVE' && sub.daysLeft !== null && sub.daysLeft <= 5 && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    Expiring soon — {sub.daysLeft} day(s) left.
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Usage
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <OrdersIcon color="secondary" />
                      <Box>
                        <Typography variant="h6">{counts.orders ?? 0}</Typography>
                        <Typography variant="caption" color="text.secondary">Orders</Typography>
                      </Box>
                    </Stack>
                  </Grid>
                  <Grid item xs={6}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <JobsIcon color="warning" />
                      <Box>
                        <Typography variant="h6">{counts.printJobs ?? 0}</Typography>
                        <Typography variant="caption" color="text.secondary">Print jobs</Typography>
                      </Box>
                    </Stack>
                  </Grid>
                  <Grid item xs={6}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <PrintersIcon color="success" />
                      <Box>
                        <Typography variant="h6">{counts.printers ?? 0}</Typography>
                        <Typography variant="caption" color="text.secondary">Printers</Typography>
                      </Box>
                    </Stack>
                  </Grid>
                  <Grid item xs={6}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <PeopleIcon color="primary" />
                      <Box>
                        <Typography variant="h6">{counts.users ?? 0}</Typography>
                        <Typography variant="caption" color="text.secondary">Users</Typography>
                      </Box>
                    </Stack>
                  </Grid>
                </Grid>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  <strong>Customers:</strong> {counts.customers ?? 0} &nbsp;|&nbsp;{' '}
                  <strong>Completed orders:</strong> {shop.completedOrders ?? 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>

      <ShopFormDialog
        open={editOpen}
        shop={shop}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); load(); }}
      />

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete shop?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This permanently deletes {shop.name} and ALL of its data. This cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
