import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Box, 
  Typography, 
  Paper, 
  Button, 
  CircularProgress, 
  Alert,
  Grid
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';

const ImageDetails: React.FC = () => {
  const { imageId } = useParams<{ imageId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const imageUrl = `/api/images/${imageId}`;

  useEffect(() => {
    const checkImage = async () => {
      try {
        // Just check if the image exists
        await axios.head(imageUrl);
        setLoading(false);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          setError('Image not found');
        } else {
          setError('Failed to load image');
        }
        setLoading(false);
        console.error('Error loading image:', error);
      }
    };

    checkImage();
  }, [imageId, imageUrl]);

  const handleBack = () => {
    navigate('/images');
  };

  const renderContent = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="30vh">
          <CircularProgress />
        </Box>
      );
    }

    if (error) {
      return <Alert severity="error">{error}</Alert>;
    }

    return (
      <Box>
        <Box sx={{ 
          position: 'relative', 
          paddingTop: '56.25%',
          mb: 3,
          backgroundColor: '#000'
        }}>
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
            onError={() => setError('Failed to load image')}
          />
        </Box>
        
        <Box textAlign="center">
          <Button 
            component="a"
            href={imageUrl}
            download
            variant="contained" 
            color="primary" 
            startIcon={<DownloadIcon />}
            sx={{ textDecoration: 'none' }}
          >
            Download Image
          </Button>
        </Box>
      </Box>
    );
  };

  return (
    <Box maxWidth="md" mx="auto" py={4}>
      <Box display="flex" alignItems="center" mb={3}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={handleBack}
          sx={{ mr: 2 }}
        >
          Back to images
        </Button>
        <Typography variant="h4" component="h1">
          Image Details
        </Typography>
      </Box>

      <Paper sx={{ p: 3 }}>
        <Grid container spacing={2} mb={3}>
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary">
              Image ID
            </Typography>
            <Typography variant="body1">
              {imageId || 'Unknown'}
            </Typography>
          </Grid>
        </Grid>
        
        {renderContent()}
      </Paper>
    </Box>
  );
};

export default ImageDetails; 