import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Box, 
  Typography, 
  Paper, 
  Button, 
  CircularProgress, 
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';

interface ImageItem {
  id: string;
  filename: string;
  status: string;
}

const ImageList: React.FC = () => {
  const navigate = useNavigate();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchImages = async () => {
    try {
      const response = await axios.get('/api/images');
      setImages(response.data.images || []);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch images');
      setLoading(false);
      console.error('Error fetching images:', err);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const handleImageClick = (id: string) => {
    navigate(`/image/${id}`);
  };

  const handleDeleteImage = async (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    
    try {
      await axios.delete(`/api/images/${id}`);
      fetchImages();
    } catch (err) {
      setError('Failed to delete image');
      console.error('Error deleting image:', err);
    }
  };

  const capitalizeFirstLetter = (str: string) => {
    if (!str || typeof str !== 'string') return 'Unknown';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box maxWidth="md" mx="auto" py={4}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4" component="h1">
          Your Images
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<AddIcon />}
          onClick={() => navigate('/create')}
        >
          Create New Video
        </Button>
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      )}
      
      {images.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            You haven't uploaded any images yet.
          </Typography>
          <Button 
            variant="outlined" 
            startIcon={<AddIcon />}
            onClick={() => navigate('/create')}
            sx={{ mt: 2 }}
          >
            Upload Your First Image
          </Button>
        </Paper>
      ) : (
        <Paper>
          <List>
            {images.map((image, index) => {
              const imageId = image?.id || '';
              const imageStatus = image?.status || 'unknown';
              
              return (
                <div key={imageId}>
                  {index > 0 && <Divider />}
                  <ListItem 
                    button 
                    onClick={() => handleImageClick(imageId)}
                    sx={{ 
                      py: 2,
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.04)'
                      }
                    }}
                  >
                    <ListItemText
                      primary={image.filename}
                      secondary={
                        <Typography
                          component="span"
                          variant="body2"
                          color={
                            imageStatus === 'ready' ? 'success.main' : 
                            imageStatus === 'processing' ? 'info.main' : 
                            imageStatus === 'failed' ? 'error.main' : 'text.secondary'
                          }
                        >
                          {capitalizeFirstLetter(imageStatus)}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      {imageStatus === 'ready' && (
                        <IconButton 
                          edge="end" 
                          aria-label="view"
                          onClick={() => handleImageClick(imageId)}
                          color="primary"
                        >
                          <VisibilityIcon />
                        </IconButton>
                      )}
                      <IconButton 
                        edge="end" 
                        aria-label="delete" 
                        onClick={(e) => handleDeleteImage(imageId, e)}
                        color="error"
                        sx={{ ml: 1 }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                </div>
              );
            })}
          </List>
        </Paper>
      )}
    </Box>
  );
};

export default ImageList; 