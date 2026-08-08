import React, { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, IconButton, Chip, Button, TextField, FormControl, InputLabel, Select, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, Alert, Tooltip,
  Grid, Card, CardContent, Divider, FormControlLabel, Switch
} from '@mui/material';
import {
  Search as SearchIcon, Refresh as RefreshIcon, Visibility as ViewIcon,
  CheckCircle as ApproveIcon, Cancel as RejectIcon, Print as PrintIcon,
  Download as DownloadIcon, ContentCopy as CopyIcon, Delete as DeleteIcon,
  PlayCircle as PlayIcon, PauseCircle as PauseIcon, Stop as StopIcon,
  FilterList as FilterIcon, MoreVert as MoreIcon
} from '@mui/icons-material';
import { useAppStore } from '../store/useAppStore';
import { orderApi, printerApi } from '../api';
import toast from 'react-hot-toast';

const PrintQueue: React.FC = () => {
  const { 
    orders, setOrders, addOrder, updateOrder, setLoading, 
    printers, setPrinters, 
    activeTab,
    settings,
    agentStatus 
  } = useAppStore();
  
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [bwPrinter, setBwPrinter] = useState('');
  const [colorPrinter, setColorPrinter] = useState('');
  const [printDialogLoading, setPrintDialogLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchPrinters();
  }, []);

  const fetchOrders = async () => {
    try {
      const params = { page: page + 1, limit: rowsPerPage };
      if (statusFilter !== 'all') params['status'] = statusFilter;
      if (search) params['search'] = search;
      
      const res = await orderApi.list(params);
      if (res.data.success) {
        setOrders(res.data.data);
      }
    } catch (e) {
      toast.error('Failed to fetch orders');
    }
  };

  const fetchPrinters = async () => {
    try {
      const res = await printerApi.list();
      if (res.data.success) {
        setPrinters(res.data.data?.printers || []);
      }
    } catch (e) {
      console.error('Failed to fetch printers', e);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(0);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setPage(0);
  };

  const handlePageChange = (_: unknown, newPage: number) => setPage(newPage);
  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(Number(e.target.value));
    setPage(0);
  };

  const handlePrintDialogOpen = (order: any) => {
    setSelectedOrder(order);
    setDialogOpen(true);
    setBwPrinter('');
    setColorPrinter('');
  };

  const handlePrintConfirm = async () => {
    if (!selectedOrder) return;
    setPrintDialogLoading(true);
    try {
      const body: any = { status: 'PRINTING' };
      if (bwPrinter) body.bwPrinterName = bwPrinter;
      if (colorPrinter) body.colorPrinterName = colorPrinter;
      
      await orderApi.dispatch(selectedOrder.id, bwPrinter || colorPrinter);
      toast.success('Order dispatched to printer');
      setDialogOpen(false);
      setSelectedOrder(null);
      fetchOrders();
    } catch (e) {
      toast.error('Failed to dispatch order');
    } finally {
      setPrintDialogLoading(false);
    }
  };

  const handleApprove = async (orderId: string) => {
    try {
      await orderApi.updateStatus(orderId, 'APPROVED');
      toast.success('Order approved');
      fetchOrders();
    } catch (e) {
      toast.error('Failed to approve order');
    }
  };

  const handleReject = async (orderId: string) => {
    try {
      await orderApi.updateStatus(orderId, 'REJECTED');
      toast.success('Order rejected');
      fetchOrders();
    } catch (e) {
      toast.error('Failed to reject order');
    }
  };

  const handleReprint = async (orderId: string) => {
    try {
      await orderApi.reprint(orderId);
      toast.success('Reprint dispatched');
      fetchOrders();
    } catch (e) {
      toast.error('Failed to reprint');
    }
  };

  const handleFetchJobs = async () => {
    setIsFetching(true);
    try {
      // This would trigger the agent to fetch new jobs
      toast.success('Fetching new jobs...');
    } catch (e) {
      toast.error('Failed to fetch jobs');
    } finally {
      setIsFetching(false);
    }
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

  const statusColors: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'> = {
    PENDING: 'warning',
    APPROVED: 'info',
    PRINTING: 'primary',
    COMPLETED: 'success',
    FAILED: 'error',
    CANCELLED: 'default',
    REJECTED: 'error',
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Print Queue</Typography>
          <Typography variant="body2" color="text.secondary">Manage and dispatch print orders</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Tooltip title="Start Agent">
            <Button 
              variant={agentStatus === 'running' ? 'outlined' : 'contained'} 
              color="success" 
              startIcon={<PlayIcon />}
              onClick={() => window.electronAPI?.startAgent?.()}
              disabled={agentStatus === 'starting' || agentStatus === 'running'}
            >
              {agentStatus === 'running' ? 'Running' : agentStatus === 'starting' ? 'Starting...' : 'Start Agent'}
            </Button>
          </Tooltip>
          <Tooltip title="Stop Agent">
            <Button 
              variant="outlined" 
              color="error" 
              startIcon={<StopIcon />}
              onClick={() => window.electronAPI?.stopAgent?.()}
              disabled={agentStatus === 'stopping' || agentStatus === 'stopped'}
            >
              Stop Agent
            </Button>
          </Tooltip>
          <Tooltip title="Fetch Jobs">
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleFetchJobs} disabled={isFetching}>
              {isFetching ? 'Fetching...' : 'Fetch Jobs'}
            </Button>
          </Tooltip>
          <Tooltip title="Run in Background">
            <Button variant="outlined" startIcon={<PauseIcon />}>
              Background
            </Button>
          </Tooltip>
        </Box>
      </Box>

      {/* Search & Filter */}
      <Paper elevation={1} sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by Token, Name, Phone..."
              value={search}
              onChange={handleSearch}
              InputProps={{
                startAdornment: <SearchIcon color="action" />,
              }}
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} label="Status" onChange={handleStatusChange}>
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="PENDING">Pending</MenuItem>
                <MenuItem value="APPROVED">Approved</MenuItem>
                <MenuItem value="PRINTING">Printing</MenuItem>
                <MenuItem value="COMPLETED">Completed</MenuItem>
                <MenuItem value="FAILED">Failed</MenuItem>
                <MenuItem value="REJECTED">Rejected</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Typography variant="body2" color="text.secondary">
              {orders?.total || 0} orders total
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Orders Table */}
      <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Token</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Files</TableCell>
                <TableCell>Pages</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Assigned Printer</TableCell>
                <TableCell>Time</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders?.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                    <Typography variant="body1" color="text.secondary">No orders found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                orders?.data?.map((order: any) => (
                  <TableRow key={order.id} hover>
                    <TableCell sx={{ fontWeight: 700, fontSize: 14 }}>#{order.token || '-'}</TableCell>
                    <TableCell>{order.customer?.name || 'Walk-in'}</TableCell>
                    <TableCell>{order.customer?.phone || '-'}</TableCell>
                    <TableCell>{order.files?.length || 0}</TableCell>
                    <TableCell>{order.totalPages || 0}</TableCell>
                    <TableCell>₹{order.total?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell>
                      <Chip 
                        label={order.paymentMethod || 'N/A'} 
                        size="small" 
                        variant="outlined" 
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={order.status} 
                        size="small" 
                        color={({ PENDING: 'warning', APPROVED: 'info', PRINTING: 'primary', COMPLETED: 'success', FAILED: 'error', REJECTED: 'error', CANCELLED: 'default' } as any)[order.status] || 'default'}
                        variant="filled"
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>
                    <TableCell>{order.printJobs?.[0]?.printer?.name || 'Unassigned'}</TableCell>
                    <TableCell>{new Date(order.createdAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, day: '2-digit', month: 'short' })}</TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title="Preview">
                          <IconButton size="small" color="primary"><Visibility /></IconButton>
                        </Tooltip>
                        {order.status === 'PENDING' && (
                          <>
                            <Tooltip title="Approve & Print">
                              <IconButton size="small" color="success" onClick={() => handlePrintDialogOpen({ ...order, status: 'PENDING' })}><ApproveIcon /></IconButton>
                            </Tooltip>
                            <Tooltip title="Reject">
                              <IconButton size="small" color="error" onClick={() => handleReject(order.id)}><RejectIcon /></IconButton>
                            </Tooltip>
                          </>
                        )}
                        {order.status === 'APPROVED' && (
                          <Tooltip title="Start Printing">
                            <IconButton size="small" color="primary" onClick={() => handlePrintDialogOpen({ ...order, status: 'APPROVED' })}><PlayIcon /></IconButton>
                          </Tooltip>
                        )}
                        {order.status === 'PRINTING' && (
                          <Tooltip title="Pause">
                            <IconButton size="small" color="warning"><PauseIcon /></IconButton>
                          </Tooltip>
                        )}
                        {order.status === 'COMPLETED' && (
                          <Tooltip title="Reprint">
                            <IconButton size="small" color="secondary" onClick={() => handleReprint(order.id)}><RefreshIcon /></IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Download">
                          <IconButton size="small"><DownloadIcon /></IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error"><DeleteIcon /></IconButton>
                        </Tooltip>
                      </Box>
</TableCell>
                    </TableRow>
                  )))})
              </TableBody>
          </Table>
        </TableContainer>
        
        {/* Pagination */}
        <TablePagination
          component="div"
          count={orders?.total || 0}
          rowsPerPage={10}
          page={0}
          onPageChange={handlePageChange}
          rowsPerPageOptions={[10, 20, 50, 100]}
          onRowsPerPageChange={handleRowsPerPageChange}
        />
      </Paper>

      {/* Print Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Select Printers for Order #{selectedOrder?.token}</DialogTitle>
        <DialogContent>
          {printDialogLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>B/W Printer</InputLabel>
                <Select value={bwPrinter} label="B/W Printer" onChange={(e) => setBwPrinter(e.target.value)}>
                  <MenuItem value=""><em>Auto (any B/W printer)</em></MenuItem>
                  {printers.filter((p: any) => !p.colorSupport).map((p: any) => (
                    <MenuItem key={p.id} value={p.name}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Color Printer</InputLabel>
                <Select value={colorPrinter} label="Color Printer" onChange={(e) => setColorPrinter(e.target.value)}>
                  <MenuItem value=""><em>Auto (any Color printer)</em></MenuItem>
                  {printers.filter((p: any) => p.colorSupport).map((p: any) => (
                    <MenuItem key={p.id} value={p.name}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handlePrintConfirm} startIcon={<PrintIcon />} disabled={printDialogLoading}>
            Print
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default PrintQueue;