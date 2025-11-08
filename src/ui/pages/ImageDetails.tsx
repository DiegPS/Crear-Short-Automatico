import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { 
  Box, 
  Typography, 
  Paper, 
  Button, 
  CircularProgress, 
  Alert,
  Grid,
  Skeleton,
  Fade,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';

const checkImageExists = async (imageUrl: string): Promise<boolean> => {
  try {
    await axios.head(imageUrl);
    return true;
  } catch {
    return false;
  }
};

const ImageDetails: React.FC = () => {
  const { imageId } = useParams<{ imageId: string }>();
  const navigate = useNavigate();
  const imageUrl = `/api/images/${imageId}`;

  const { data: imageExists, isLoading, error } = useQuery({
    queryKey: ['image', imageId],
    queryFn: () => checkImageExists(imageUrl),
    enabled: !!imageId,
    retry: 2,
  });

  const handleBack = () => {
    navigate('/images');
  };

  if (isLoading) {
    return (
      <Box maxWidth="lg" mx="auto" py={4} className="fade-in">
        <Skeleton variant="rectangular" height={400} sx={{ mb: 3, borderRadius: 2 }} />
        <Skeleton variant="text" height={40} />
      </Box>
    );
  }

  if (error || !imageExists) {
    return (
      <Box maxWidth="lg" mx="auto" py={4} className="fade-in">
        <Alert 
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={handleBack}>
              Volver
            </Button>
          }
        >
          Imagen no encontrada o error al cargar.
        </Alert>
      </Box>
    );
  }

  return (
    <Box maxWidth="lg" mx="auto" py={4} className="fade-in">
      <Box display="flex" alignItems="center" mb={3}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={handleBack}
          sx={{ mr: 'auto' }}
        >
          Volver a Imágenes
        </Button>
      </Box>

      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
        Detalles de la Imagen
      </Typography>

      <Paper sx={{ p: { xs: 2, sm: 4 }, mb: 3 }}>
        <Grid container spacing={3} mb={3}>
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              ID de la Imagen
            </Typography>
            <Typography 
              variant="body1" 
              sx={{ 
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                fontWeight: 500,
              }}
            >
              {imageId || 'Desconocido'}
            </Typography>
          </Grid>
        </Grid>
        
        <Fade in>
          <Box>
            <Box 
              sx={{ 
                position: 'relative', 
                paddingTop: '75%', // 4:3 aspect ratio
                mb: 3,
                backgroundColor: '#f5f5f5',
                borderRadius: 2,
                overflow: 'hidden',
                boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.1)',
              }}
            >
              <img
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain'
                }}
                src={imageUrl}
                alt={`Image ${imageId}`}
                onError={(e) => {
                  console.error('Image load error:', e);
                }}
              />
            </Box>
            
            <Box display="flex" justifyContent="center" gap={2} flexWrap="wrap">
              <Button 
                component="a"
                href={imageUrl}
                download
                variant="contained" 
                color="primary" 
                startIcon={<DownloadIcon />}
                size="large"
                sx={{
                  boxShadow: '0px 4px 12px rgba(99, 102, 241, 0.3)',
                  '&:hover': {
                    boxShadow: '0px 6px 16px rgba(99, 102, 241, 0.4)',
                  },
                }}
              >
                Descargar Imagen
              </Button>
            </Box>
          </Box>
        </Fade>
      </Paper>
    </Box>
  );
};

export default ImageDetails;