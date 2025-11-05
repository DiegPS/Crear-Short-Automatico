import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { 
  Box, 
  Typography, 
  Button, 
  CircularProgress, 
  Alert,
  Grid,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Skeleton,
  Fade,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageIcon from '@mui/icons-material/Image';

interface ImageItem {
  id: string;
  filename: string;
  status: string;
}

const fetchImages = async (): Promise<ImageItem[]> => {
  const response = await axios.get('/api/images');
  return response.data.images || [];
};

const deleteImage = async (id: string): Promise<void> => {
  await axios.delete(`/api/images/${id}`);
};

const ImageList: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: images = [], isLoading, error, refetch } = useQuery({
    queryKey: ['images'],
    queryFn: fetchImages,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteImage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
    },
  });

  const handleImageClick = (id: string) => {
    navigate(`/image/${id}`);
  };

  const handleDeleteImage = async (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (window.confirm('Are you sure you want to delete this image?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <Box className="fade-in">
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Skeleton variant="text" width={200} height={40} />
          <Skeleton variant="rectangular" width={150} height={40} borderRadius={2} />
        </Box>
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map((i) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
              <Card>
                <Skeleton variant="rectangular" height={200} />
                <CardContent>
                  <Skeleton variant="text" height={24} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert 
        severity="error" 
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }
      >
        Failed to load images. Please try again.
      </Alert>
    );
  }

  return (
    <Box className="fade-in">
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            Your Images
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {images.length} {images.length === 1 ? 'image' : 'images'} total
          </Typography>
        </Box>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<AddIcon />}
          onClick={() => navigate('/create')}
          size="large"
          sx={{
            boxShadow: '0px 4px 12px rgba(99, 102, 241, 0.3)',
            '&:hover': {
              boxShadow: '0px 6px 16px rgba(99, 102, 241, 0.4)',
            },
          }}
        >
          Create New Video
        </Button>
      </Box>
      
      {images.length === 0 ? (
        <Fade in>
          <Box
            sx={{
              textAlign: 'center',
              py: 8,
              px: 3,
            }}
          >
            <ImageIcon 
              sx={{ 
                fontSize: 80, 
                color: 'text.secondary',
                mb: 2,
                opacity: 0.5,
              }} 
            />
            <Typography variant="h5" gutterBottom color="text.secondary" fontWeight={600}>
              No images yet
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              Upload images to use in Ken Burns videos. You can upload them when creating a video.
            </Typography>
            <Button 
              variant="contained" 
              size="large"
              startIcon={<AddIcon />}
              onClick={() => navigate('/create')}
              sx={{
                boxShadow: '0px 4px 12px rgba(99, 102, 241, 0.3)',
                '&:hover': {
                  boxShadow: '0px 6px 16px rgba(99, 102, 241, 0.4)',
                },
              }}
            >
              Create Video with Images
            </Button>
          </Box>
        </Fade>
      ) : (
        <Grid container spacing={3}>
          {images.map((image, index) => {
            const imageId = image?.id || '';
            const imageUrl = `/api/images/${imageId}`;
            
            return (
              <Grid item xs={12} sm={6} md={4} lg={3} key={imageId}>
                <Fade in timeout={(index + 1) * 50}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
                      },
                    }}
                    onClick={() => handleImageClick(imageId)}
                  >
                    <Box
                      sx={{
                        position: 'relative',
                        paddingTop: '75%', // 4:3 aspect ratio
                        backgroundColor: '#f5f5f5',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={imageUrl}
                        alt={image.filename}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                        loading="lazy"
                      />
                    </Box>
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Typography 
                        variant="body2" 
                        component="div"
                        sx={{ 
                          fontWeight: 500,
                          wordBreak: 'break-word',
                          mb: 0.5,
                        }}
                      >
                        {image.filename}
                      </Typography>
                      <Typography 
                        variant="caption" 
                        color="text.secondary"
                        sx={{ 
                          fontFamily: 'monospace',
                          fontSize: '0.7rem',
                        }}
                      >
                        {imageId.substring(0, 16)}...
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleImageClick(imageId);
                        }}
                      >
                        <VisibilityIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => handleDeleteImage(imageId, e)}
                        disabled={deleteMutation.isPending}
                        sx={{
                          '&:hover': {
                            bgcolor: 'error.light',
                            color: 'white',
                          },
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </CardActions>
                  </Card>
                </Fade>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};

export default ImageList;