import React, { useState } from 'react';
import { 
  Box, Paper, Typography, Grid, Card, CardContent, Button, TextField, 
  FormControl, InputLabel, Select, MenuItem, Divider, Alert,
  CircularProgress, Tabs, Tab, FormControlLabel, Switch
} from '@mui/material';
import { 
  CreditCard, Description, Crop, RotateLeft, Layers,
  Download, Print, ContentCopy, ContentPaste
} from '@mui/icons-material';

const AadhaarPan: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [formData, setFormData] = useState({
    documentType: 'aadhaar',
    operation: 'pvc',
    layout: 'front-back',
    copies: 1,
    lamination: false,
    frontImage: null as string | null,
    backImage: null as string | null,
  });

  const tabs = [
    { id: 'aadhaar', label: 'Aadhaar Card', icon: <CreditCard /> },
    { id: 'pan', label: 'PAN Card', icon: <Description /> },
  ];

  const handleImageUpload = (field: 'frontImage' | 'backImage', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setFormData({ ...formData, [field]: e.target?.result as string });
      reader.readAsDataURL(file);
    }
  };

  const handleProcess = async () => {
    // Process Aadhaar/PAN
    alert('Processing...');
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Aadhaar / PAN Services</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        PVC cards, resize, crop, lamination & multi-page layouts
      </Typography>

      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3 }}>
        {tabs.map(tab => (
          <Tab key={tab.id} label={tab.label} icon={tab.icon} />
        ))}
      </Tabs>

      <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>{tabs[activeTab].label} Services</Typography>
        
        <Grid container spacing={2}>
          {/* Upload Section */}
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" gutterBottom>Front Side</Typography>
            <Box
              onClick={() => document.getElementById('front-upload')?.click()}
              sx={{
                p: 3, textAlign: 'center', border: '2px dashed', borderColor: 'primary.main',
                borderRadius: 2, cursor: 'pointer', transition: 'all 0.2s',
                '&:hover': { bgcolor: 'action.hover' }
              }}
            >
              <input
                id="front-upload"
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handleImageUpload('frontImage', e)}
              />
              <Description sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body1" color="text.secondary">
                {formData.frontImage ? 'Front uploaded' : 'Upload front side'}
              </Typography>
            </Box>
            {formData.frontImage && (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <img src={formData.frontImage} alt="Front" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 1 }} />
              </Box>
            )}
          </Grid>

          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" gutterBottom>Back Side</Typography>
            <Box
              onClick={() => document.getElementById('back-upload')?.click()}
              sx={{
                p: 3, textAlign: 'center', border: '2px dashed', borderColor: 'primary.main',
                borderRadius: 2, cursor: 'pointer', transition: 'all 0.2s',
                '&:hover': { bgcolor: 'action.hover' }
              }}
            >
              <input
                id="back-upload"
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handleImageUpload('backImage', e)}
              />
              <Description sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body1" color="text.secondary">
                {formData.backImage ? 'Back uploaded' : 'Upload back side'}
              </Typography>
            </Box>
            {formData.backImage && (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <img src={formData.backImage} alt="Back" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 1 }} />
              </Box>
            )}
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        {/* Options */}
        <Typography variant="subtitle1" gutterBottom>Options</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Operation</InputLabel>
              <Select value={formData.operation} label="Operation" onChange={(e) => setFormData({ ...formData, operation: e.target.value })}>
                <MenuItem value="pvc">PVC Card</MenuItem>
                <MenuItem value="resize">Resize Only</MenuItem>
                <MenuItem value="crop">Auto Crop</MenuItem>
                <MenuItem value="rotate">Rotate</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Layout</InputLabel>
              <Select value={formData.layout} label="Layout" onChange={(e) => setFormData({ ...formData, layout: e.target.value })}>
                <MenuItem value="front-back">Front + Back (Two Pages)</MenuItem>
                <MenuItem value="one-page">Front + Back (One Page)</MenuItem>
                <MenuItem value="front-only">Front Only</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField type="number" fullWidth label="Copies" value={formData.copies} onChange={(e) => setFormData({ ...formData, copies: parseInt(e.target.value) || 1 })} inputProps={{ min: 1, max: 50 }} />
          </Grid>

          <Grid item xs={12} sm={4}>
            <FormControlLabel
              control={<Switch checked={formData.lamination} onChange={(e) => setFormData({ ...formData, lamination: e.target.checked })} />}
              label="Add Lamination (₹10 extra)"
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <FormControlLabel
              control={<Switch checked={false} onChange={() => {}} />}
              label="Auto Detect & Crop"
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <FormControlLabel
              control={<Switch checked={false} onChange={() => {}} />}
              label="Auto Rotate"
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
          <Button variant="outlined" startIcon={<ContentCopy />}>
            Duplicate Front to Back
          </Button>
          <Button variant="outlined" startIcon={<RotateLeft />}>
            Rotate 90°
          </Button>
          <Button variant="outlined" startIcon={<Crop />}>
            Auto Crop
          </Button>
          <Button variant="contained" size="large" startIcon={<Download />} onClick={handleProcess}>
            Generate & Print
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default AadhaarPan;