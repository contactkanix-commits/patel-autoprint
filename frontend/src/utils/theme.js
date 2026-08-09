import { createTheme } from '@mui/material/styles';

export const createAppTheme = (mode = 'light') =>
  createTheme({
    palette: {
      mode,
      primary: { main: '#4f46e5', light: '#818cf8', dark: '#4338ca', contrastText: '#ffffff' },
      secondary: { main: '#0ea5e9', light: '#38bdf8', dark: '#0284c7', contrastText: '#ffffff' },
      background:
        mode === 'light'
          ? { default: '#f4f5fb', paper: '#ffffff' }
          : { default: '#0b1020', paper: '#161c33' },
      success: { main: '#16a34a' },
      warning: { main: '#f59e0b' },
      error: { main: '#dc2626' },
      divider: mode === 'light' ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.14)',
    },
    typography: {
      fontFamily: '"Roboto","Helvetica","Arial",sans-serif',
      h4: { fontWeight: 700 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: { borderRadius: 10 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 10, fontWeight: 600 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { borderRadius: 14 },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { borderRadius: 14 },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 10 },
        },
      },
    },
  });
