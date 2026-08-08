import React, { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardContent, Button, TextField,
  FormControl, InputLabel, Select, MenuItem, Divider, Alert,
  CircularProgress, Tabs, Tab, FormControlLabel, Switch, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CardHeader, CardActions, IconButton
} from '@mui/material';
import {
  TrendingUp, AttachMoney, ShoppingCart, CheckCircle, Print as PrintIcon,
  Person, LocalOffer, PieChart, BarChart, ShowChart, Refresh as RefreshIcon,
  Download, CalendarToday, DateRange, FilterList, Description as DescriptionIcon
} from '@mui/icons-material';
import { useAppStore } from '../store/useAppStore';
import { dashboardApi, orderApi, printerApi } from '../api';
import { format } from 'date-fns';

const DailyStats: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [dateRange, setDateRange] = useState({ start: new Date(), end: new Date() });
  const [loading, setLoading] = useState(false);
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const [printerUsage, setPrinterUsage] = useState<any[]>([]);
  const [paperUsage, setPaperUsage] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await dashboardApi.stats();
      if (res.data.success) {
        setStats(res.data.data);
        setHourlyData(res.data.data.hourlyStats || []);
      }
    } catch (e) {
      console.error('Failed to fetch stats', e);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

  const statCards = [
    { title: 'Today\'s Revenue', value: formatCurrency(stats?.todayRevenue || 0), icon: <AttachMoney />, color: 'success' },
    { title: 'Today\'s Orders', value: stats?.todayOrders || 0, icon: <ShoppingCart />, color: 'primary' },
    { title: 'Completed Today', value: stats?.completedToday || 0, icon: <CheckCircle />, color: 'success' },
    { title: 'Pending', value: stats?.pendingOrders || 0, icon: <LocalOffer />, color: 'warning' },
    { title: 'Printing', value: stats?.printingOrders || 0, icon: <PrintIcon />, color: 'primary' },
    { title: 'Total Customers', value: stats?.totalCustomers || 0, icon: <Person />, color: 'info' },
    { title: 'Active Printers', value: `${stats?.activePrinters || 0} / ${(useAppStore.getState().printers || []).length}`, icon: <PrintIcon />, color: 'secondary' },
    { title: 'Avg Order Value', value: stats?.todayOrders ? formatCurrency((stats.todayRevenue || 0) / stats.todayOrders) : '₹0', icon: <AttachMoney />, color: 'secondary' },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" gutterBottom>Daily Statistics</Typography>
          <Typography variant="body2" color="text.secondary">Business performance dashboard</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<CalendarToday />}>Today</Button>
          <Button variant="outlined" startIcon={<DateRange />}>This Week</Button>
          <Button variant="outlined" startIcon={<Download />} disabled>Export</Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchStats} disabled={loading}>
            <CircularProgress size={18} />
          </Button>
        </Box>
      </Box>

      {/* Stat Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statCards.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Paper elevation={2} sx={{ p: 3, borderRadius: 2, borderLeft: 4, borderColor: stat.color + '.main' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" gutterBottom>{stat.title}</Typography>
                  <Typography variant="h4" fontWeight={700}>{stat.value}</Typography>
                </Box>
                <Box sx={{ p: 1, borderRadius: '50%', bgcolor: stat.color + '.light' }}>
                  {stat.icon}
                </Box>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Hourly Orders Chart */}
        <Grid item xs={12} lg={8}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6"><ShowChart /> Hourly Orders</Typography>
              <Chip label="Today" size="small" color="primary" />
            </Box>
            <Box sx={{ height: 300 }}>
              {/* Simple bar chart using divs */}
              <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '100%', px: 1 }}>
                {hourlyData.map((h, i) => (
                  <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flex: 1 }}>
                    <Box
                      sx={{
                        width: '100%',
                        maxHeight: '100%',
                        height: `${Math.max((h.count / Math.max(1, Math.max(...hourlyData.map(h => h.count))) * 90), 4)}%`,
                        bgcolor: 'primary.main',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease',
                        '&:hover': { bgcolor: 'primary.dark' },
                      }}
                    />
                    <Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {h.hour}:00
                    </Typography>
                    <Typography variant="caption" fontWeight={600} sx={{ fontSize: 10, textAlign: 'center', color: 'text.secondary' }}>
                      {h.count}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Revenue & Printer Usage */}
        <Grid item xs={12} lg={4}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom><AttachMoney /> Revenue Breakdown</Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">B&W Prints</Typography>
                <Typography variant="body2" fontWeight={600}>₹{((stats?.todayRevenue || 0) * 0.6).toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Color Prints</Typography>
                <Typography variant="body2" fontWeight={600}>₹{((stats?.todayRevenue || 0) * 0.4).toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Services (Lam/Bind/Scan)</Typography>
                <Typography variant="body2" fontWeight={600}>₹{((stats?.todayRevenue || 0) * 0.1).toFixed(2)}</Typography>
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <Typography>Total</Typography>
                <Typography>{formatCurrency(stats?.todayRevenue || 0)}</Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Printer Usage */}
        <Grid item xs={12} lg={4}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom><PrintIcon /> Printer Usage</Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[
                { name: 'Canon 6575', prints: 45, status: 'ONLINE' },
                { name: 'Konica C458', prints: 32, status: 'ONLINE' },
                { name: 'Photo Printer', prints: 12, status: 'ONLINE' },
              ].map((p, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label={p.status} size="small" color={p.status === 'ONLINE' ? 'success' : 'error'} variant="filled" />
                    <Typography variant="body2">{p.name}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{p.prints} prints</Typography>
                    <Box sx={{ width: 60, height: 6, borderRadius: 3, bgcolor: 'grey.200' }}>
                      <Box sx={{ width: `${(p.prints / 50) * 100}%`, height: '100%', bgcolor: 'primary.main', borderRadius: 3 }} />
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>

        {/* Paper Usage */}
        <Grid item xs={12} lg={4}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom><DescriptionIcon /> Paper Usage Today</Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[
                { size: 'A4', used: 245, color: 'primary' },
                { size: 'A3', used: 67, color: 'secondary' },
                { size: 'Legal', used: 23, color: 'success' },
                { size: 'Photo 4x6', used: 45, color: 'warning' },
                { size: 'Photo 5x7', used: 18, color: 'error' },
              ].map((p, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label={p.size} size="small" color={p.color} variant="outlined" />
                    <Typography variant="body2">{p.used} sheets</Typography>
                  </Box>
                  <Box sx={{ width: 80, height: 6, borderRadius: 3, bgcolor: 'grey.200' }}>
                    <Box sx={{ width: `${(p.used / 250) * 100}%`, height: '100%', bgcolor: p.color + '.main', borderRadius: 3 }} />
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>

        {/* Order Status Distribution */}
        <Grid item xs={12} lg={8}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom><LocalOffer /> Order Status Distribution</Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              {[
                { label: 'Pending', count: useAppStore.getState().orders?.filter((o: any) => o.status === 'PENDING').length || 0, color: 'warning' },
                { label: 'Approved', count: useAppStore.getState().orders?.filter((o: any) => o.status === 'APPROVED').length || 0, color: 'info' },
                { label: 'Printing', count: useAppStore.getState().orders?.filter((o: any) => o.status === 'PRINTING').length || 0, color: 'primary' },
                { label: 'Completed', count: useAppStore.getState().orders?.filter((o: any) => o.status === 'COMPLETED').length || 0, color: 'success' },
                { label: 'Failed', count: useAppStore.getState().orders?.filter((o: any) => o.status === 'FAILED').length || 0, color: 'error' },
                { label: 'Rejected', count: useAppStore.getState().orders?.filter((o: any) => o.status === 'REJECTED').length || 0, color: 'default' },
              ].map((s, i) => (
                <Grid item xs={6} sm={4} key={i}>
                  <Paper elevation={1} sx={{ p: 2, textAlign: 'center', borderRadius: 2, borderTop: 4, borderColor: s.color + '.main' }}>
                    <Chip label={s.label} color={s.color} size="small" sx={{ mb: 1 }} />
                    <Typography variant="h4" fontWeight={700}>{s.count}</Typography>
                    <Typography variant="caption" color="text.secondary">orders</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default DailyStats;