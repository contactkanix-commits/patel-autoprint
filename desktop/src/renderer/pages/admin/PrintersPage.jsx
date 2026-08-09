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
  Chip,
  CircularProgress,
  Alert,
  Tooltip,
  FormControlLabel,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Print as PrintIcon,
  Star as StarIcon,
  Circle as CircleIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../api';

const PAPER_SIZES = ['A4', 'A3', 'A5', 'A2', 'Letter', 'Legal', 'Tabloid'];

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

export default function PrintersPage() {
  const [connected, setConnected] = useState([]);
  const [systemPrinters, setSystemPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyName, setBusyName] = useState(null);
  const [drafts, setDrafts] = useState({});

  const getDraft = useCallback(
    (name) =>
      drafts[name] || { color: false, duplex: false, paperSizes: ['A4'] },
    [drafts]
  );

  const updateDraft = useCallback((name, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [name]: {
        color: false,
        duplex: false,
        paperSizes: ['A4'],
        ...prev[name],
        ...patch,
      },
    }));
  }, []);

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
      const map = {};
      connected.forEach((p) => {
        map[p.name] = p;
      });
      const existing = map[sys.name];
      if (connect && !existing) {
        const draft = getDraft(sys.name);
        await api.post('/printers', {
          name: sys.name,
          ip: sys.portName || null,
          colorSupport: draft.color,
          duplexSupport: draft.duplex,
          paperSizes: draft.paperSizes,
        });
        toast.success(`Connected "${sys.name}"`);
      } else if (!connect && existing) {
        await api.delete(`/printers/${existing.id}`);
        toast.success(`Disconnected "${sys.name}"`);
      }
      await loadConnected();
    });
  };

  const handleToggleConnectedOption = async (record, field, value) => {
    await runBusy(record.name, async () => {
      await api.put(`/printers/${record.id}`, { [field]: value });
      toast.success('Printer updated');
      await loadConnected();
    });
  };

  const map = {};
  connected.forEach((p) => {
    map[p.name] = p;
  });

  const rows = systemPrinters.map((sys) => ({
    id: sys.name,
    name: sys.name,
    portName: sys.portName,
    sub: `${sys.driverName}${sys.portName ? `  ·  ${sys.portName}` : ''}`,
    status: sys.status,
    isDefault: sys.isDefault,
    connected: !!map[sys.name],
    record: map[sys.name] || null,
  }));

  // Show connected printers that are no longer detected on this PC so the
  // owner can still disconnect them.
  connected.forEach((rec) => {
    if (!systemPrinters.some((s) => s.name === rec.name)) {
      rows.push({
        id: rec.name,
        name: rec.name,
        portName: rec.ip || '',
        sub: 'Not detected on this PC',
        status: rec.status || 'UNKNOWN',
        isDefault: false,
        connected: true,
        record: rec,
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
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 680 }}>
            Printers installed on this PC are detected automatically. Switch on the ones you want to
            use with Patel AutoPrint, then tick what each printer can do (color, double-sided, and
            the paper sizes it supports). Jobs are only sent to printers that can handle them.
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
                  <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper', minWidth: 200 }}>Printer</TableCell>
                  <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Color</TableCell>
                  <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Duplex</TableCell>
                  <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Paper Sizes</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>Connected</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const draft = row.connected ? {} : getDraft(row.name);
                  const color = row.connected ? row.record.colorSupport : draft.color;
                  const duplex = row.connected ? row.record.duplexSupport : draft.duplex;
                  const paperSizes = row.connected
                    ? row.record.paperSizes || ['A4']
                    : draft.paperSizes;

                  const setColor = (v) =>
                    row.connected
                      ? handleToggleConnectedOption(row.record, 'colorSupport', v)
                      : updateDraft(row.name, { color: v });
                  const setDuplex = (v) =>
                    row.connected
                      ? handleToggleConnectedOption(row.record, 'duplexSupport', v)
                      : updateDraft(row.name, { duplex: v });
                  const setPaperSize = (size, on) => {
                    const next = on
                      ? [...new Set([...paperSizes, size])]
                      : paperSizes.filter((s) => s !== size);
                    if (row.connected) {
                      handleToggleConnectedOption(row.record, 'paperSizes', next.length ? next : ['A4']);
                    } else {
                      updateDraft(row.name, { paperSizes: next.length ? next : ['A4'] });
                    }
                  };

                  return (
                    <TableRow
                      key={row.id}
                      hover
                      sx={{
                        transition: 'all 0.2s ease',
                        '&:hover': { bgcolor: 'action.hover', transform: 'translateX(4px)' },
                        verticalAlign: 'top',
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
                      <TableCell>
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={color}
                              disabled={busyName === row.name}
                              onChange={(e) => setColor(e.target.checked)}
                            />
                          }
                          label={<Typography variant="caption">Color</Typography>}
                          sx={{ m: 0 }}
                        />
                      </TableCell>
                      <TableCell>
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={duplex}
                              disabled={busyName === row.name}
                              onChange={(e) => setDuplex(e.target.checked)}
                            />
                          }
                          label={<Typography variant="caption">Duplex</Typography>}
                          sx={{ m: 0 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 340 }}>
                          {PAPER_SIZES.map((size) => {
                            const selected = paperSizes.includes(size);
                            return (
                              <Chip
                                key={size}
                                size="small"
                                label={size}
                                clickable
                                disabled={busyName === row.name}
                                color={selected ? 'primary' : 'default'}
                                variant={selected ? 'filled' : 'outlined'}
                                onClick={() => setPaperSize(size, !selected)}
                                sx={{ borderRadius: 12, fontWeight: 500 }}
                              />
                            );
                          })}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" color={row.connected ? 'success.main' : 'text.secondary'} fontWeight={500}>
                            {row.connected ? 'Connected' : 'Not connected'}
                          </Typography>
                          <Switch
                            checked={row.connected}
                            disabled={busyName === row.name}
                            onChange={(e) =>
                              handleToggleConnect(
                                { name: row.name, portName: row.portName },
                                e.target.checked
                              )
                            }
                            color="primary"
                          />
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Alert severity="info" sx={{ borderRadius: 2, mt: 3 }}>
            Color, double-sided and paper-size support are set by you — they are not detected
            automatically, because drivers can report capabilities incorrectly. Only connected
            printers appear in the order print dialogs.
          </Alert>
        </>
      )}
    </Box>
  );
}
