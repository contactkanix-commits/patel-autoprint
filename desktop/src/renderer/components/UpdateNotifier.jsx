import { useEffect, useState } from 'react';
import { Alert, AlertTitle, Button, Box, CircularProgress } from '@mui/material';
import { Update as UpdateIcon } from '@mui/icons-material';

export default function UpdateNotifier() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!window.patelApp?.updates) return;
    window.patelApp.updates.getStatus().then(setStatus).catch(() => {});
    const unsub = window.patelApp.updates.onStatus(setStatus);
    return unsub;
  }, []);

  if (!status) return null;

  if (status.state === 'downloaded') {
    return (
      <Alert
        severity="success"
        icon={<UpdateIcon />}
        sx={{ borderRadius: 0 }}
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => window.patelApp.updates.install()}
          >
            Update &amp; Restart
          </Button>
        }
      >
        <AlertTitle>Update ready</AlertTitle>
        Version {status.version} has been downloaded. Click to install now, or it
        will install automatically when you close the app.
      </Alert>
    );
  }

  if (status.state === 'downloading') {
    return (
      <Alert
        severity="info"
        icon={status.percent ? <CircularProgress size={18} variant="determinate" value={status.percent} /> : <UpdateIcon />}
        sx={{ borderRadius: 0 }}
      >
        <AlertTitle>Downloading update{status.version ? ` v${status.version}` : ''}...</AlertTitle>
        {status.percent !== undefined && (
          <Box component="span" sx={{ fontWeight: 600 }}>{status.percent}%</Box>
        )}
      </Alert>
    );
  }

  return null;
}
