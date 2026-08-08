import React, { useState } from 'react';
import { 
  Box, Paper, Typography, Grid, Card, CardContent, Button, TextField, 
  FormControl, InputLabel, Select, MenuItem, Divider, Alert,
  CircularProgress, Slider, SliderValueLabelComponent
} from '@mui/material';
import { 
  Crop, PhotoCamera, Palette, Person, CheckCircle, 
  Download, Image as ImageIcon, Delete as DeleteIcon
} from '@mui/icons-material';
import { useAppStore } from '../store/useAppStore';
import { toast } from 'react-hot-toast';

const PassportPhotos: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    country: 'India',
    size: '35x45mm',
    background: 'white',
    dress: 'formal',
    copies: 2,
  });
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const steps = ['Customer Info', 'Photo Settings', 'Preview & Print'];

  const handleNext = () => setActiveStep(prev => Math.min(prev + 1, 2));
  const handleBack = () => setActiveStep(prev => Math.max(prev - 1, 0));

  const handleSubmit = async () => {
    setLoading(true);
    setTimeout(() => {
      toast.success('Passport photo generated!');
      setLoading(false);
    }, 1500);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setPreviewImage(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Passport Photos</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Create professional passport, visa & ID photos
      </Typography>

      <Box sx={{ mb: 3 }}>
        {steps.map((step, index) => (
          <Box key={step} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box 
              sx={{ 
                width: 32, height: 32, borderRadius: '50%', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600,
                bgcolor: index < activeStep ? 'success.main' : index === activeStep ? 'primary.main' : 'grey.300',
                color: index <= activeStep ? 'white' : 'grey.600',
              }}
            >
              {index < activeStep ? '✓' : index + 1}
            </Box>
            <Typography variant="body2" fontWeight={activeStep === index ? 600 : 400}>{step}</Typography>
            {index < steps.length - 1 && <Box sx={{ flexGrow: 1, height: 2, bgcolor: index < activeStep ? 'success.main' : 'grey.300', borderRadius: 1 }} />}
          </Box>
        ))}
      </Box>

      <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
        {activeStep === 0 && (
          <Box>
            <Typography variant="h6" gutterBottom>Customer Information</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Customer Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Country</InputLabel>
                  <Select value={formData.country} label="Country" onChange={(e) => setFormData({ ...formData, country: e.target.value })}>
                    <MenuItem value="India">India</MenuItem>
                    <MenuItem value="USA">USA</MenuItem>
                    <MenuItem value="UK">UK</MenuItem>
                    <MenuItem value="Canada">Canada</MenuItem>
                    <MenuItem value="Australia">Australia</MenuItem>
                    <MenuItem value="Schengen">Schengen (Europe)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" onClick={handleNext}>Next</Button>
            </Box>
          </Box>
        )}

        {activeStep === 1 && (
          <Box>
            <Typography variant="h6" gutterBottom>Photo Settings</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Photo Size</InputLabel>
                  <Select value={formData.size} label="Size" onChange={(e) => setFormData({ ...formData, size: e.target.value })}>
                    <MenuItem value="35x45mm">35x45 mm (India Standard)</MenuItem>
                    <MenuItem value="51x51mm">51x51 mm (US Visa)</MenuItem>
                    <MenuItem value="2x2in">2x2 inch (US Passport)</MenuItem>
                    <MenuItem value="35x35mm">35x35 mm</MenuItem>
                    <MenuItem value="45x35mm">45x35 mm</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Background</InputLabel>
                  <Select value={formData.background} label="Background" onChange={(e) => setFormData({ ...formData, background: e.target.value })}>
                    <MenuItem value="white">White</MenuItem>
                    <MenuItem value="light-blue">Light Blue</MenuItem>
                    <MenuItem value="light-grey">Light Grey</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Dress Style</InputLabel>
                  <Select value={formData.dress} label="Dress" onChange={(e) => setFormData({ ...formData, dress: e.target.value })}>
                    <MenuItem value="formal">Formal Shirt</MenuItem>
                    <MenuItem value="suit">Suit</MenuItem>
                    <MenuItem value="saree">Saree</MenuItem>
                    <MenuItem value="none">None (Original)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField type="number" fullWidth label="Copies" value={formData.copies} onChange={(e) => setFormData({ ...formData, copies: parseInt(e.target.value) || 1 })} inputProps={{ min: 1, max: 20 }} />
              </Grid>
            </Grid>
            
            <Divider sx={{ my: 3 }} />
            
            <Typography variant="subtitle2" gutterBottom>Upload Photo</Typography>
            <Box
              onClick={() => document.getElementById('photo-upload')?.click()}
              sx={{
                p: 4, textAlign: 'center', border: '2px dashed', borderColor: 'primary.main',
                borderRadius: 2, cursor: 'pointer', transition: 'all 0.2s',
                '&:hover': { bgcolor: 'action.hover' }
              }}
            >
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                hidden
                onChange={handleImageUpload}
              />
              <PhotoCamera sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body1" color="text.secondary">
                Click or drag & drop photo here
              </Typography>
              <Typography variant="caption" color="text.secondary">
                JPG, PNG, WebP · Max 10MB
              </Typography>
            </Box>

            {previewImage && (
              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <img src={previewImage} alt="Preview" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 2 }} />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  Preview - Photo will be auto-cropped to selected size
                </Typography>
              </Box>
            )}

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
              <Button variant="outlined" onClick={handleBack}>Back</Button>
              <Button variant="contained" onClick={handleNext}>Next</Button>
            </Box>
          </Box>
        )}

        {activeStep === 2 && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="h6" gutterBottom>Preview & Print</Typography>
            {previewImage ? (
              <>
                <Box sx={{ mt: 2 }}>
                  <img src={previewImage} alt="Final" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 2 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    Size: {formData.size} · Background: {formData.background} · Copies: {formData.copies}
                  </Typography>
                </Box>
              </>
            ) : (
              <Alert severity="warning">Please upload a photo first</Alert>
            )}
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center', gap: 2 }}>
              <Button variant="outlined" onClick={handleBack}>Back</Button>
              <Button variant="contained" size="large" onClick={handleSubmit} disabled={loading || !previewImage}>
                Print Passport Photos
              </Button>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default PassportPhotos;