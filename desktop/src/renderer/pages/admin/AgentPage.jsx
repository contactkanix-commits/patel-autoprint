import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Memory as MemoryIcon,
  CheckCircle as CompletedIcon,
  Cancel as FailedIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';

function agentAvailable() {
  return typeof window !== 'undefined' && !!window.patelApp?.agent;
}

function useAgentStatus() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!agentAvailable()) return;
    window.patelApp.agent.getStatus().then(setStatus).catch(() => {});
    const unsubscribe = window.patelApp.agent.onStatus(setStatus);
    return unsubscribe;
  }, []);

  return status;
}

function StatCard({ label, value, icon, color }) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>{value}</Typography>
          </Box>
          <Box sx={{ bgcolor: `${color}.light`, borderRadius: 2, p: 1.5, display: 'flex' }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function AgentPage() {
  const status = useAgentStatus();
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const running = status?.status === 'running';

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      const res = await window.patelApp.agent.start();
      if (res && res.success === false) toast.error(res.message || 'Failed to start agent');
      else toast.success('Agent started');
    } catch {
      toast.error('Failed to start agent');
    } finally {
      setStarting(false);
    }
  }, []);

  const handleStop = useCallback(async () => {
    setStopping(true);
    try {
      await window.patelApp.agent.stop();
      toast.success('Agent stopped');
    } catch {
      toast.error('Failed to stop agent');
    } finally {
      setStopping(false);
    }
  }, []);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MemoryIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h5" fontWeight="600">Print Agent</Typography>
          <Chip
            label={running ? 'Running' : 'Stopped'}
            color={running ? 'success' : 'default'}
            size="small"
            sx={{ ml: 1 }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            color="success"
            startIcon={starting ? <CircularProgress size={18} /> : <StartIcon />}
            onClick={handleStart}
            disabled={running || starting}
          >
            Start
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={stopping ? <CircularProgress size={18} /> : <StopIcon />}
            onClick={handleStop}
            disabled={!running || stopping}
          >
            Stop
          </Button>
        </Box>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        The agent automatically downloads approved print jobs from the cloud and sends them to
        your local printers. It keeps running even when this window is closed.
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Jobs Processed" value={status?.processed ?? 0} icon={<PrintIcon sx={{ color: 'primary.main' }} />} color="primary" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Completed" value={status?.completed ?? 0} icon={<CompletedIcon sx={{ color: 'success.main' }} />} color="success" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Failed" value={status?.failed ?? 0} icon={<FailedIcon sx={{ color: 'error.main' }} />} color="error" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Last Poll"
            value={status?.lastPoll ? new Date(status.lastPoll).toLocaleTimeString('en-IN') : '-'}
            icon={<RefreshIcon sx={{ color: 'info.main' }} />}
            color="info"
          />
        </Grid>
      </Grid>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Current Activity</Typography>
          <Divider sx={{ mb: 2 }} />
          {status?.current ? (
            <Typography variant="body1">
              Printing job <strong>{status.current}</strong>...
            </Typography>
          ) : (
            <Typography variant="body1" color="text.secondary">
              {running ? 'Idle - waiting for print jobs' : 'Agent is stopped'}
            </Typography>
          )}
          {status?.lastError && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              Last error: {status.lastError}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Agent Log</Typography>
          <Divider sx={{ mb: 2 }} />
          <Box
            sx={{
              bgcolor: 'grey.900',
              color: 'grey.100',
              borderRadius: 2,
              p: 2,
              maxHeight: 320,
              overflowY: 'auto',
              fontFamily: 'Consolas, monospace',
              fontSize: 12,
            }}
          >
            {(!status?.log || status.log.length === 0) && (
              <Typography variant="body2" sx={{ color: 'grey.500' }}>
                No activity yet.
              </Typography>
            )}
            {status?.log?.map((entry, i) => (
              <Box key={i} sx={{ whiteSpace: 'pre-wrap' }}>
                <span style={{ color: 'grey.500' }}>
                  {new Date(entry.ts).toLocaleTimeString('en-IN')}
                </span>{' '}
                <span style={{ color: entry.level === 'error' ? '#f44336' : entry.level === 'warn' ? '#ff9800' : '#4caf50' }}>
                  [{entry.level.toUpperCase()}]
                </span>{' '}
                {entry.msg}
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
