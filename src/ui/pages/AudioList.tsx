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
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import AudioFileIcon from '@mui/icons-material/AudioFile';

interface AudioItem {
  id: string;
  filename: string;
  status: string;
}

const fetchAudios = async (): Promise<AudioItem[]> => {
  const response = await axios.get('/api/audio');
  return response.data.audios || [];
};

const deleteAudio = async (id: string): Promise<void> => {
  await axios.delete(`/api/audio/${id}`);
};

const AudioList: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: audios = [], isLoading, error, refetch } = useQuery({
    queryKey: ['audios'],
    queryFn: fetchAudios,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAudio,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audios'] });
    },
  });

  const handleDeleteAudio = async (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (window.confirm('¿Estás seguro de que quieres eliminar este audio?')) {
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
            Reintentar
          </Button>
        }
      >
        Error al cargar audios. Por favor, intenta de nuevo.
      </Alert>
    );
  }

  return (
    <Box className="fade-in">
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            Tus Audios
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {audios.length} {audios.length === 1 ? 'audio' : 'audios'} en total
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
          Crear Nuevo Video
        </Button>
      </Box>
      
      {audios.length === 0 ? (
        <Fade in>
          <Box
            sx={{
              textAlign: 'center',
              py: 8,
              px: 3,
            }}
          >
            <AudioFileIcon 
              sx={{ 
                fontSize: 80, 
                color: 'text.secondary',
                mb: 2,
                opacity: 0.5,
              }} 
            />
            <Typography variant="h5" gutterBottom color="text.secondary" fontWeight={600}>
              No hay audios aún
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              Sube audios para usar tu propia voz en los videos. Puedes subirlos al crear un video.
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
              Crear Video con Audio
            </Button>
          </Box>
        </Fade>
      ) : (
        <Grid container spacing={3}>
          {audios.map((audio, index) => {
            const audioId = audio?.id || '';
            const audioUrl = `/api/audio/${audioId}`;
            
            return (
              <Grid item xs={12} sm={6} md={4} lg={3} key={audioId}>
                <Fade in timeout={(index + 1) * 50}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
                      },
                    }}
                  >
                    <Box
                      sx={{
                        position: 'relative',
                        paddingTop: '75%',
                        backgroundColor: '#f5f5f5',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <AudioFileIcon 
                        sx={{ 
                          fontSize: 80, 
                          color: 'text.secondary',
                          opacity: 0.3,
                        }} 
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
                        {audio.filename}
                      </Typography>
                      <Typography 
                        variant="caption" 
                        color="text.secondary"
                        sx={{ 
                          fontFamily: 'monospace',
                          fontSize: '0.7rem',
                        }}
                      >
                        {audioId.substring(0, 16)}...
                      </Typography>
                    </CardContent>
                    <CardContent>
                      <audio controls src={audioUrl} style={{ width: '100%' }} />
                    </CardContent>
                    <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => handleDeleteAudio(audioId, e)}
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

export default AudioList;

