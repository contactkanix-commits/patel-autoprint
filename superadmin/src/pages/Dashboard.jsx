import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Chip,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Store as StoreIcon,
  ReceiptLong as OrdersIcon,
  Print as PrintersIcon,
  Description as JobsIcon,
  Logout as LogoutIcon,
  VpnKey as VpnKeyIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api';
import ShopFormDialog from '../components/ShopFormDialog';
import ChangePasswordDialog from '../components/ChangePasswordDialog';

const STATUS_COLORS = {
  ACTIVE: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'error',
  SUSPENDED: 'error',
  CANCELLED: 'default',
};

function StatCard({ icon, label, value, color = 'primary' }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Avatar sx={{ bgcolor: `${color}.main`, width: 48, height: 48 }}>
            {icon}
          </Avatar>
          <Box>
            <Typography variant="h5">{value}</Typography>
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [keyRegenId, setKeyRegenId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [statsRes, shopsRes] = await Promise.all([
        api.get('/superadmin/stats'),
        api.get('/superadmin/shops', { params: { q: query || undefined } }),
      ]);
      setStats(statsRes.data);
      setShops(shopsRes.data);
    } catch (err) {
      // interceptor handles
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleLogout = () => {
    localStorage.removeItem('superadmin_token');
    localStorage.removeItem('superadmin_user');
    navigate('/superadmin/login', { replace: true });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/superadmin/shops/${deleteTarget.id}`);
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      // interceptor handles
    } finally {
      setDeleting(false);
    }
  };

  const copyKey = (key) => {
    navigator.clipboard?.writeText(key);
    toast.success('Agent key copied');
  };

  const regenerateKey = async (shop) => {
    setKeyRegenId(shop.id);
    try {
      const res = await api.post(`/superadmin/shops/${shop.id}/regenerate-key`);
      toast.success('Agent key rotated');
      copyKey(res.data.agentKey);
      load();
    } catch (err) {
      // interceptor handles
    } finally {
      setKeyRegenId(null);
    }
  };

  const subCounts = stats?.subscriptions || {};
  const totalShops = stats?.shops || 0;

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Toolbar sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Patel AutoPrint Admin
        </Typography>
        <Button startIcon={<RefreshIcon />} onClick={load}>
          Refresh
        </Button>
        <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)}>
          <MoreVertIcon />
        </IconButton>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          <MenuItem onClick={() => { setMenuAnchor(null); setPwdOpen(true); }}>
            Change password
          </MenuItem>
          <MenuItem onClick={() => { setMenuAnchor(null); handleLogout(); }}>
            <LogoutIcon sx={{ mr: 1 }} fontSize="small" /> Logout
          </MenuItem>
        </Menu>
      </Toolbar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {loading && !stats ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
              <Box sx={{ flexGrow: 1 }}>
                <StatCard icon={<StoreIcon />} label="Shops" value={stats?.shops ?? 0} color="primary" />
              </Box>
              <Box sx={{ flexGrow: 1 }}>
                <StatCard icon={<OrdersIcon />} label="Orders" value={stats?.orders ?? 0} color="secondary" />
              </Box>
              <Box sx={{ flexGrow: 1 }}>
                <StatCard icon={<PrintersIcon />} label="Printers" value={stats?.printers ?? 0} color="success" />
              </Box>
              <Box sx={{ flexGrow: 1 }}>
                <StatCard icon={<JobsIcon />} label="Print Jobs" value={stats?.printJobs ?? 0} color="warning" />
              </Box>
            </Stack>

            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Subscriptions
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Chip label={`ACTIVE: ${subCounts.ACTIVE ?? 0}`} color="success" variant="outlined" />
                  <Chip label={`EXPIRING: ${subCounts.EXPIRING ?? 0}`} color="warning" variant="outlined" />
                  <Chip label={`EXPIRED: ${subCounts.EXPIRED ?? 0}`} color="error" variant="outlined" />
                  <Chip label={`SUSPENDED: ${subCounts.SUSPENDED ?? 0}`} color="error" variant="outlined" />
                  <Chip label={`CANCELLED: ${subCounts.CANCELLED ?? 0}`} color="default" variant="outlined" />
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <Toolbar sx={{ gap: 2 }}>
                <SearchIcon color="action" />
                <TextField
                  size="small"
                  placeholder="Search by shop name or agent key"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  sx={{ flexGrow: 1 }}
                />
                <Button variant="contained" startIcon={<StoreIcon />} onClick={() => { setEditing(null); setFormOpen(true); }}>
                  Add Shop
                </Button>
              </Toolbar>
              <TableContainer component={Paper} elevation={0}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Shop</TableCell>
                      <TableCell>Plan</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Ends On</TableCell>
                      <TableCell>Agent Key</TableCell>
                      <TableCell align="center">Orders / Printers / Users</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shops.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          No shops found
                        </TableCell>
                      </TableRow>
                    )}
                    {shops.map((s) => {
                      const sub = s.subStatus || {};
                      return (
                        <TableRow key={s.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/superadmin/shops/${s.id}`)}>
                          <TableCell>
                            <Typography fontWeight={600}>{s.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {s.agentKey}
                            </Typography>
                          </TableCell>
                          <TableCell>{sub.plan}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={sub.status}
                              color={STATUS_COLORS[sub.status] || 'default'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            {sub.endDate ? new Date(sub.endDate).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="body2" fontFamily="monospace">
                                {s.agentKey}
                              </Typography>
                              <Tooltip title="Copy key">
                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); copyKey(s.agentKey); }}>
                                  <VpnKeyIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Rotate key">
                                <IconButton
                                  size="small"
                                  disabled={keyRegenId === s.id}
                                  onClick={(e) => { e.stopPropagation(); regenerateKey(s); }}
                                >
                                  {keyRegenId === s.id ? <CircularProgress size={14} /> : <RefreshIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                          <TableCell align="center">
                            {s._count?.orders} / {s._count?.printers} / {s._count?.users}
                          </TableCell>
                          <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                            <IconButton
                              size="small"
                              onClick={() => { setEditing(s); setFormOpen(true); }}
                            >
                              Edit
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeleteTarget(s)}
                            >
                              Delete
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          </>
        )}
      </Container>

      <ShopFormDialog
        open={formOpen}
        shop={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load(); }}
      />

      <ChangePasswordDialog open={pwdOpen} onClose={() => setPwdOpen(false)} />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete shop?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This permanently deletes {deleteTarget?.name} and ALL of its orders, printers, users and print jobs. This cannot be undone.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
