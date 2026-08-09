import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Switch,
  CircularProgress,
  Alert,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Print as PrintIcon,
  Star as StarIcon,
  Circle as CircleIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../api';

function StatusChip({ status }) {
  const map = {
    ONLINE: { color: 'success', dot: true },
    PRINTING: { color: 'primary', dot: true },
    OFFLINE: { color: 'error', dot: false },
    UNKNOWN: { color: 'default', dot: false },
  };
  const { color, dot } = map[status] || map.UNKNOWN;
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        minWidth: 84,
        height: 28,
        borderRadius: '20px',
        bgcolor: `${color}.light`,
        color: `${color}.dark`,
        px: 1.5,
        fontWeight: 500,
        fontSize: 12,
      }}
    >
      {dot && <CircleIcon sx={{ fontSize: 8, mr: 1 }} />}
      {status}
    </Box>
  );
}

function CapabilityChip({ value }) {
  return (
    <Chip
      size="small"
      icon={value ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : <CancelIcon sx={{ fontSize: 16 }} />}
      label={value ? 'Yes' : 'No'}
      color={value ? 'success' : 'default'}
      sx={{ borderRadius: 12, fontWeight: 500 }}
    />
  );
}

export default function PrintersPage() {
  const [connected, setConnected] = useState([]);
  const [systemPrinters, setSystemPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyName, setBusyName] = useState(null);

  const connectedByName = useCallback(() => {
    const map = {};
    connected.forEach((p) => {
      map[p.name] = p;
    });
    return map;
  }, [connected]);

  const loadConnected = async () => {
    const result = await api.get('/printers');
    if (result.success) {
      setConnected(result.data?.printers || []);
    }
  };

  const loadSystem = async () => {
    if (!window.patelApp?.printers) return;
    setSystemPrinters(await window.patelApp.printers.listSystem());
  };

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadConnected(), loadSystem()]);
    } catch {
      // Handled by interceptor
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runBusy = async (name, fn) => {
    setBusyName(name);
    try {
      await fn();
    } catch {
      // Handled by interceptor
    } finally {
      setBusyName(null);
    }
  };

  const handleToggleConnect = async (sys, connect) => {
    await runBusy(sys.name, async () => {
      const map = connectedByName();
      const existing = map[sys.name];
      if (connect && !existing) {
        await api.post('/printers', {
          name: sys.name,
          ip: sys.portName || null,
          colorSupport: sys.color,
          duplexSupport: sys.duplex,
        });
        toast.success(`Connected "${sys.name}"`);
      } else if (!connect && existing) {
        await api.delete(`/printers/${existing.id}`);
        toast.success(`Disconnected "${sys.name}"`);
      }
      await loadConnected();
    });
  };

  const handleToggleCapability = async (record, field) => {
    await runBusy(record.name, async () => {
      await api.put(`/printers/${record.id}`, {
        [field]: !record[field],
      });
      toast.success('Printer updated');
      await loadConnected();
    });
  };

  const map = connectedByName();
  const rows = systemPrinters.map((sys) => ({
    id: sys.name,
    name: sys.name,
    portName: sys.portName,
    sub: `${sys.driverName}${sys.portName ? `  ·  ${sys.portName}` : ''}`,
    status: sys.status,
    color: map[sys.name]?.colorSupport ?? sys.color,
    duplex: map[sys.name]?.duplexSupport ?? sys.duplex,
    connected: !!map[sys.name],
    record: map[sys.name] || null,
    isDefault: sys.isDefault,
  }));

  // Show connected printers that are no longer detected on this PC so the
  // owner can still disconnect them.
  connected.forEach((rec) => {
    if (!systemPrinters.some((s) => s.name === rec.name)) {
      rows.push({
        id: rec.name,
        name: rec.name,
        sub: 'Not detected on this PC',
        status: rec.status || 'UNKNOWN',
        color: rec.colorSupport,
        duplex: rec.duplexSupport,
        connected: true,
        record: rec,
        isDefault: false,
      });
    }
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PrintIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Typography variant="h5" fontWeight="600">Printers</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 640 }}>
            Printers installed on this PC are detected automatically. Switch on the ones you want to
            use with Patel AutoPrint — jobs will be sent to the selected printer by name.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={refresh}
          disabled={refreshing}
          sx={{ borderRadius: 2, textTransform: 'none', px: 3 }}
        >
          {refreshing ? 'Scanning...' : 'Refresh Printers'}
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : rows.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <PrintIcon sx={{ mr: 1, fontSize: 32 }} />
            No printers detected on this PC. Install a printer in Windows Settings, then refresh.
          </Box>
        </Alert>
      ) : (
        <>
          <TableContainer
            component={Paper}
            sx={{ borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}
          >
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Printer</TableCell>
                  <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Status</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Color</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Duplex</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Use with Patel AutoPrint</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    sx={{
                      transition: 'all 0.2s ease',
                      '&:hover': { bgcolor: 'action.hover', transform: 'translateX(4px)' },
                    }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <PrintIcon color={row.connected ? 'primary' : 'disabled'} sx={{ fontSize: 24 }} />
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body1" fontWeight={500}>{row.name}</Typography>
                            {row.isDefault && (
                              <Tooltip title="Windows default printer">
                                <StarIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                              </Tooltip>
                            )}
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {row.sub}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                    <TableCell align="center">
                      {row.connected ? (
                        <Tooltip title={row.color ? 'Color enabled' : 'Color disabled'}>
                          <Switch
                            size="small"
                            checked={row.color}
                            disabled={busyName === row.name}
                            onChange={() => handleToggleCapability(row.record, 'colorSupport')}
                          />
                        </Tooltip>
                      ) : (
                        <CapabilityChip value={row.color} />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {row.connected ? (
                        <Tooltip title={row.duplex ? 'Double-sided enabled' : 'Double-sided disabled'}>
                          <Switch
                            size="small"
                            checked={row.duplex}
                            disabled={busyName === row.name}
                            onChange={() => handleToggleCapability(row.record, 'duplexSupport')}
                          />
                        </Tooltip>
                      ) : (
                        <CapabilityChip value={row.duplex} />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color={row.connected ? 'success.main' : 'text.secondary'} fontWeight={500}>
                          {row.connected ? 'Connected' : 'Not connected'}
                        </Typography>
                        <Switch
                          checked={row.connected}
                          disabled={busyName === row.name}
                          onChange={(e) => handleToggleConnect({ name: row.name, portName: row.portName, color: row.color, duplex: row.duplex }, e.target.checked)}
                          color="primary"
                        />
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Alert severity="info" sx={{ borderRadius: 2, mt: 3 }}>
            Color and duplex support are detected automatically from the printer driver. You can
            override them with the switches while a printer is connected. Only connected printers
            appear in the order print dialogs.
          </Alert>
        </>
      )}
    </Box>
  );
}
