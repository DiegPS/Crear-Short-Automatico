import React, { useEffect } from 'react';
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
  LinearProgress,
  Chip,
  IconButton,
  Fade,
  Skeleton,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ErrorIcon from '@mui/icons-material/Error';
import { VideoStatus } from '../../types/shorts';

interface VideoStatusResponse {
  status: VideoStatus;
  progress?: number;
}

const fetchVideoStatus = async (videoId: string): Promise<VideoStatusResponse> => {
  const response = await axios.get(`/api/short-video/${videoId}/status`);
  return response.data;
};

const VideoDetails: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();

  const { data: statusData, isLoading, error, refetch } = useQuery({
    queryKey: ['videoStatus', videoId],
    queryFn: () => fetchVideoStatus(videoId!),
    enabled: !!videoId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Keep polling if processing, stop when ready or failed
      return status === 'processing' ? 3000 : false;
    },
    retry: 2,
  });

  const status = statusData?.status || 'processing';
  const progress = statusData?.progress;

  const handleBack = () => {
    navigate('/');
  };

  const getStatusConfig = (status: VideoStatus | string) => {
    switch (status) {
      case 'ready':
        return {
          icon: <CheckCircleIcon />,
          color: 'success' as const,
          label: 'Listo',
          description: '¡Tu video está listo para ver!',
        };
      case 'processing':
        return {
          icon: <HourglassEmptyIcon />,
          color: 'info' as const,
          label: 'Procesando',
          description: 'Tu video se está creando. Esto puede tardar unos minutos.',
        };
      case 'failed':
        return {
          icon: <ErrorIcon />,
          color: 'error' as const,
          label: 'Fallido',
          description: 'El procesamiento del video falló. Por favor, intenta de nuevo con diferentes configuraciones.',
        };
      default:
        return {
          icon: <ErrorIcon />,
          color: 'default' as const,
          label: 'Desconocido',
          description: 'Estado desconocido. Por favor, actualiza la página.',
        };
    }
  };

  const statusConfig = getStatusConfig(status);

  const renderContent = () => {
    if (isLoading) {
      return (
        <Box>
          <Skeleton variant="rectangular" height={400} sx={{ mb: 3, borderRadius: 2 }} />
          <Skeleton variant="text" height={40} width="60%" />
        </Box>
      );
    }

    if (error) {
      return (
        <Alert 
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Reintentar
            </Button>
          }
        >
          Error al obtener el estado del video. Por favor, intenta de nuevo.
        </Alert>
      );
    }

    if (status === 'processing') {
      return (
        <Fade in>
          <Box textAlign="center" py={6}>
            <CircularProgress 
              size={80} 
              thickness={4}
              sx={{ 
                mb: 3,
                color: 'primary.main',
              }} 
            />
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
              Creando tu video...
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              {statusConfig.description}
            </Typography>
            <Box sx={{ maxWidth: 400, mx: 'auto', mb: 2 }}>
              <LinearProgress 
                variant={progress !== undefined ? "determinate" : "indeterminate"}
                value={progress}
                sx={{ 
                  height: 8,
                  borderRadius: 4,
                }} 
              />
              {progress !== undefined && (
                <Typography 
                  variant="body2" 
                  color="text.secondary" 
                  sx={{ mt: 1, textAlign: 'center' }}
                >
                  {progress}%
                </Typography>
              )}
            </Box>
            <Box mt={3}>
              <Chip
                icon={statusConfig.icon}
                label={statusConfig.label}
                color={statusConfig.color}
                sx={{ fontSize: '0.875rem', px: 1 }}
              />
            </Box>
          </Box>
        </Fade>
      );
    }

    if (status === 'ready') {
      return (
        <Fade in>
          <Box>
            <Box mb={3} textAlign="center">
              <Typography 
                variant="h5" 
                color="success.main" 
                gutterBottom 
                sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}
              >
                <CheckCircleIcon />
                ¡Tu video está listo!
              </Typography>
            </Box>
            
            <Box 
              sx={{ 
                position: 'relative', 
                paddingTop: '56.25%', // 16:9 aspect ratio
                mb: 3,
                backgroundColor: '#000',
                borderRadius: 2,
                overflow: 'hidden',
                boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.2)',
              }}
            >
              <video
                controls
                autoPlay
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
                src={`/api/short-video/${videoId}`}
                onError={(e) => {
                  console.error('Video playback error:', e);
                }}
              />
            </Box>
            
            <Box display="flex" justifyContent="center" gap={2} flexWrap="wrap">
              <Button 
                component="a"
                href={`/api/short-video/${videoId}`}
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
                Descargar Video
              </Button>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => refetch()}
                size="large"
              >
                Actualizar
              </Button>
            </Box>
          </Box>
        </Fade>
      );
    }

    if (status === 'failed') {
      return (
        <Fade in>
          <Alert 
            severity="error" 
            sx={{ mb: 3 }}
            action={
              <Button 
                color="inherit" 
                size="small" 
                onClick={() => navigate('/create')}
              >
                Crear Nuevo
              </Button>
            }
          >
            {statusConfig.description}
          </Alert>
        </Fade>
      );
    }

    return (
      <Alert severity="info" sx={{ mb: 3 }}>
        {statusConfig.description}
      </Alert>
    );
  };

  return (
    <Box maxWidth="lg" mx="auto" py={4} className="fade-in">
      <Box display="flex" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={handleBack}
          sx={{ mr: 'auto' }}
        >
          Volver a Videos
        </Button>
        <Chip
          icon={statusConfig.icon}
          label={statusConfig.label}
          color={statusConfig.color}
          sx={{ fontSize: '0.875rem' }}
        />
      </Box>

      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
        Detalles del Video
      </Typography>

      <Paper sx={{ p: { xs: 2, sm: 4 }, mb: 3 }}>
        <Grid container spacing={3} mb={3}>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              ID del Video
            </Typography>
            <Typography 
              variant="body1" 
              sx={{ 
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                fontWeight: 500,
              }}
            >
              {videoId || 'Desconocido'}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Estado
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <Chip
                icon={statusConfig.icon}
                label={statusConfig.label}
                color={statusConfig.color}
                size="small"
              />
            </Box>
          </Grid>
        </Grid>
        
        {renderContent()}
      </Paper>
    </Box>
  );
};

export default VideoDetails;