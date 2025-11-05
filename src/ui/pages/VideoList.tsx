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
  Chip,
  IconButton,
  Skeleton,
  Fade,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ErrorIcon from '@mui/icons-material/Error';

interface VideoItem {
  id: string;
  status: string;
}

const fetchVideos = async (): Promise<VideoItem[]> => {
  const response = await axios.get('/api/short-videos');
  return response.data.videos || [];
};

const deleteVideo = async (id: string): Promise<void> => {
  await axios.delete(`/api/short-video/${id}`);
};

const VideoList: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: videos = [], isLoading, error, refetch } = useQuery({
    queryKey: ['videos'],
    queryFn: fetchVideos,
    refetchInterval: 5000, // Refetch every 5 seconds to check for status updates
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVideo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });

  const handleCreateNew = () => {
    navigate('/create');
  };

  const handleVideoClick = (id: string) => {
    navigate(`/video/${id}`);
  };

  const handleDeleteVideo = async (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (window.confirm('Are you sure you want to delete this video?')) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'ready':
        return {
          icon: <CheckCircleIcon />,
          color: 'success' as const,
          label: 'Ready',
        };
      case 'processing':
        return {
          icon: <HourglassEmptyIcon />,
          color: 'info' as const,
          label: 'Processing',
        };
      case 'failed':
        return {
          icon: <ErrorIcon />,
          color: 'error' as const,
          label: 'Failed',
        };
      default:
        return {
          icon: <VideoLibraryIcon />,
          color: 'default' as const,
          label: 'Unknown',
        };
    }
  };

  const processedVideos = useMemo(() => {
    return videos.sort((a, b) => {
      // Sort by status: processing first, then ready, then failed
      const statusOrder = { processing: 0, ready: 1, failed: 2 };
      const aOrder = statusOrder[a.status as keyof typeof statusOrder] ?? 3;
      const bOrder = statusOrder[b.status as keyof typeof statusOrder] ?? 3;
      return aOrder - bOrder;
    });
  }, [videos]);

  if (isLoading) {
    return (
      <Box className="fade-in">
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Skeleton variant="text" width={200} height={40} />
          <Skeleton variant="rectangular" width={150} height={40} borderRadius={2} />
        </Box>
        <Grid container spacing={3}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Card>
                <CardContent>
                  <Skeleton variant="text" height={32} />
                  <Skeleton variant="text" width="60%" />
                </CardContent>
                <CardActions>
                  <Skeleton variant="rectangular" width={80} height={36} />
                </CardActions>
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
        Failed to load videos. Please try again.
      </Alert>
    );
  }

  return (
    <Box className="fade-in">
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            Your Videos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {videos.length} {videos.length === 1 ? 'video' : 'videos'} total
          </Typography>
        </Box>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<AddIcon />}
          onClick={handleCreateNew}
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
      
      {videos.length === 0 ? (
        <Fade in>
          <Box
            sx={{
              textAlign: 'center',
              py: 8,
              px: 3,
            }}
          >
            <VideoLibraryIcon 
              sx={{ 
                fontSize: 80, 
                color: 'text.secondary',
                mb: 2,
                opacity: 0.5,
              }} 
            />
            <Typography variant="h5" gutterBottom color="text.secondary" fontWeight={600}>
              No videos yet
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              Get started by creating your first short video. It's quick and easy!
            </Typography>
            <Button 
              variant="contained" 
              size="large"
              startIcon={<AddIcon />}
              onClick={handleCreateNew}
              sx={{
                boxShadow: '0px 4px 12px rgba(99, 102, 241, 0.3)',
                '&:hover': {
                  boxShadow: '0px 6px 16px rgba(99, 102, 241, 0.4)',
                },
              }}
            >
              Create Your First Video
            </Button>
          </Box>
        </Fade>
      ) : (
        <Grid container spacing={3}>
          {processedVideos.map((video, index) => {
            const statusConfig = getStatusConfig(video.status);
            const videoId = video?.id || '';
            
            return (
              <Grid item xs={12} sm={6} md={4} key={videoId}>
                <Fade in timeout={(index + 1) * 100}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: video.status === 'ready' ? 'pointer' : 'default',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': video.status === 'ready' ? {
                        transform: 'translateY(-4px)',
                        boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
                      } : {},
                    }}
                    onClick={() => video.status === 'ready' && handleVideoClick(videoId)}
                  >
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography 
                            variant="h6" 
                            component="h2" 
                            gutterBottom
                            sx={{ 
                              fontWeight: 600,
                              wordBreak: 'break-word',
                            }}
                          >
                            Video {videoId.substring(0, 12)}...
                          </Typography>
                        </Box>
                        <Chip
                          icon={statusConfig.icon}
                          label={statusConfig.label}
                          color={statusConfig.color}
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      </Box>
                      
                      <Typography 
                        variant="body2" 
                        color="text.secondary"
                        sx={{ 
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                        }}
                      >
                        ID: {videoId}
                      </Typography>
                    </CardContent>
                    
                    <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                      <Box>
                        {video.status === 'ready' && (
                          <Button
                            size="small"
                            startIcon={<PlayArrowIcon />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVideoClick(videoId);
                            }}
                            sx={{ mr: 1 }}
                          >
                            View
                          </Button>
                        )}
                        {video.status === 'processing' && (
                          <Box display="flex" alignItems="center" gap={1}>
                            <CircularProgress size={16} />
                            <Typography variant="body2" color="text.secondary">
                              Creating...
                            </Typography>
                          </Box>
                        )}
                      </Box>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => handleDeleteVideo(videoId, e)}
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

export default VideoList;