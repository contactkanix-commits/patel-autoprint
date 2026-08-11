import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Alert,
  Step,
  StepLabel,
  Stepper,
} from '@mui/material';
import {
  WhatsApp as WhatsAppIcon,
  Link as LinkIcon,
  PhoneAndroid as PhoneIcon,
  DeleteForever as UnlinkIcon,
  Refresh as RetryIcon,
  CheckCircle as ConnectedIcon,
  Send as SendIcon,
  LinkOff as LinkOffIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';

function waAvailable() {
  return typeof window !== 'undefined' && !!window.patelApp?.whatsapp;
}

export default function WhatsAppPage() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    if (!waAvailable()) return;
    window.patelApp.whatsapp.getStatus().then(setStatus).catch(() => {});
    const unsubscribe = window.patelApp.whatsapp.onStatus(setStatus);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!waAvailable()) return;
    if (autoStartedRef.current) return;
    const state = status?.state;
    if (state === 'idle') {
      autoStartedRef.current = true;
      window.patelApp.whatsapp.start().catch(() => {});
    }
  }, [status]);

  const handleStart = useCallback(async () => {
    setBusy(true);
    try {
      const res = await window.patelApp.whatsapp.start();
      if (res && res.success === false) toast.error(res.message || 'Failed to start WhatsApp');
    } catch {
      toast.error('Failed to start WhatsApp');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleUnlink = useCallback(async () => {
    if (!window.confirm('Unlink WhatsApp?\nFiles sent to this number will no longer be received until you link it again.')) return;
    setBusy(true);
    try {
      await window.patelApp.whatsapp.logout();
      toast.success('WhatsApp unlinked');
      autoStartedRef.current = true; // don't auto-reconnect right after unlinking
    } catch {
      toast.error('Failed to unlink WhatsApp');
    } finally {
      setBusy(false);
    }
  }, []);

  const state = status?.state || 'idle';
  const phone = status?.phone;
  const qr = status?.qr;
  const error = status?.error;

  const statusMeta = {
    idle: { label: 'Not linked', color: 'default' },
    connecting: { label: 'Connecting...', color: 'info' },
    'waiting-for-qr': { label: 'Waiting for scan', color: 'warning' },
    connected: { label: 'Receiving files', color: 'success' },
    closed: { label: 'Disconnected', color: 'error' },
  }[state] || { label: state, color: 'default' };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WhatsAppIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h5" fontWeight="600">WhatsApp File Receiving</Typography>
          <Chip label={statusMeta.label} color={statusMeta.color} size="small" sx={{ ml: 1 }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {(state === 'idle' || state === 'closed') && (
            <>
              <Button
                variant="contained"
                color="success"
                startIcon={busy ? <CircularProgress size={18} /> : <LinkIcon />}
                onClick={handleStart}
                disabled={busy}
              >
                Link / Start
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<UnlinkIcon />}
                onClick={handleUnlink}
                disabled={busy}
              >
                Unlink
              </Button>
            </>
          )}
          {state === 'connected' && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<UnlinkIcon />}
              onClick={handleUnlink}
              disabled={busy}
            >
              Unlink
            </Button>
          )}
          {(state === 'connecting' || state === 'waiting-for-qr') && (
            <Button
              variant="outlined"
              startIcon={<RetryIcon />}
              onClick={handleStart}
              disabled={busy}
            >
              Retry
            </Button>
          )}
        </Box>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Link your shop's WhatsApp number once. When customers send files to that number, this app
        saves them and automatically replies with a link where they set print options and pay.
        It works even while this window is closed.
      </Typography>

      {error && (
        <Alert severity="error" icon={<LinkOffIcon />} sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          {state === 'connected' && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <ConnectedIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
              <Typography variant="h6">
                Receiving files as {phone ? `+${phone}` : 'your WhatsApp number'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Customers who message this number will get an automatic reply with a link to set
                their print options. Keep this app running on the shop computer.
              </Typography>
            </Box>
          )}

          {state === 'waiting-for-qr' && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h6" gutterBottom>
                Scan this code with your WhatsApp
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Open WhatsApp on the shop's phone → Settings → Linked devices → Link a device
              </Typography>
              {qr ? (
                <Box
                  sx={{
                    display: 'inline-block',
                    bgcolor: '#fff',
                    p: 2,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <img src={qr} alt="WhatsApp QR code" style={{ width: 260, height: 260 }} />
                </Box>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              )}
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 2 }}>
                The code refreshes until it's scanned. Keep this window open.
              </Typography>
            </Box>
          )}

          {state === 'connecting' && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Connecting to WhatsApp...
              </Typography>
            </Box>
          )}

          {state === 'idle' && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <PhoneIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography variant="h6">WhatsApp is not linked yet</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                Click "Link / Start" and scan the QR code with the shop's WhatsApp to begin
                receiving files.
              </Typography>
              <Button variant="contained" color="success" startIcon={<LinkIcon />} onClick={handleStart} disabled={busy}>
                Link WhatsApp
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>How it works</Typography>
          <Divider sx={{ mb: 2 }} />
          <Stepper activeStep={-1} alternativeLabel sx={{ pt: 1 }}>
            <Step>
              <StepLabel icon={<SendIcon color="primary" />}>
                Customer sends files to your number
              </StepLabel>
            </Step>
            <Step>
              <StepLabel icon={<WhatsAppIcon color="success" />}>
                App auto-replies with a portal link
              </StepLabel>
            </Step>
            <Step>
              <StepLabel icon={<LinkIcon color="info" />}>
                They tap it, choose print options & pay
              </StepLabel>
            </Step>
          </Stepper>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Activity Log</Typography>
          <Divider sx={{ mb: 2 }} />
          <Box
            sx={{
              bgcolor: 'grey.900',
              color: 'grey.100',
              borderRadius: 2,
              p: 2,
              maxHeight: 240,
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
