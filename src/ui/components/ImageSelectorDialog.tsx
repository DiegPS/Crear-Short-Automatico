import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Card,
  CardMedia,
  Typography,
  Box,
  InputAdornment,
  CircularProgress,
  Alert,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ImageIcon from '@mui/icons-material/Image';

interface ImageData {
  id: string;
  filename: string;
  status?: string;
}

interface ImageSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (imageId: string, imageUrl: string) => void;
  availableImages: ImageData[];
  isLoading?: boolean;
}

const ImageSelectorDialog: React.FC<ImageSelectorDialogProps> = ({
  open,
  onClose,
  onSelect,
  availableImages,
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredImages = useMemo(() => {
    if (!searchTerm.trim()) {
      return availableImages;
    }
    const search = searchTerm.toLowerCase();
    return availableImages.filter(
      (img) =>
        img.filename.toLowerCase().includes(search) ||
        img.id.toLowerCase().includes(search)
    );
  }, [availableImages, searchTerm]);

  const handleImageSelect = (image: ImageData) => {
    const imageUrl = `/api/images/${image.id}`;
    onSelect(image.id, imageUrl);
    onClose();
    setSearchTerm('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '500px',
          maxHeight: '80vh',
        },
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <ImageIcon color="primary" />
          <Typography variant="h6" component="span">
            Seleccionar Imagen Guardada
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          placeholder="Buscar por nombre o ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ mb: 3 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />

        {isLoading ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
            <CircularProgress />
          </Box>
        ) : filteredImages.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            {searchTerm
              ? 'No se encontraron imágenes que coincidan con la búsqueda'
              : 'No hay imágenes guardadas. Sube una imagen primero.'}
          </Alert>
        ) : (
          <Grid container spacing={2} sx={{ maxHeight: '400px', overflowY: 'auto', pr: 1 }}>
            {filteredImages.map((image) => {
              const imageUrl = `/api/images/${image.id}`;
              return (
                <Grid item xs={6} sm={4} md={3} key={image.id}>
                  <Card
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 4,
                      },
                    }}
                    onClick={() => handleImageSelect(image)}
                  >
                    <CardMedia
                      component="img"
                      height="120"
                      image={imageUrl}
                      alt={image.filename}
                      sx={{
                        objectFit: 'cover',
                      }}
                    />
                    <Box sx={{ p: 1 }}>
                      <Typography
                        variant="caption"
                        component="div"
                        sx={{
                          fontWeight: 500,
                          wordBreak: 'break-word',
                          fontSize: '0.7rem',
                        }}
                        noWrap
                      >
                        {image.filename}
                      </Typography>
                    </Box>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          Cancelar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImageSelectorDialog;

