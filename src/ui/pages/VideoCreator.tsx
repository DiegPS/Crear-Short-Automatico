import React, { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import axios from "axios";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  IconButton,
  Divider,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  Card,
  CardMedia,
  Stepper,
  Step,
  StepLabel,
  Chip,
  FormHelperText,
  Fade,
  Collapse,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import VideoCameraBackIcon from "@mui/icons-material/VideoCameraBack";
import ImageIcon from "@mui/icons-material/Image";
import SettingsIcon from "@mui/icons-material/Settings";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import {
  SceneInput,
  RenderConfig,
  MusicMoodEnum,
  CaptionPositionEnum,
  VoiceEnum,
  OrientationEnum,
  MusicVolumeEnum,
  KenBurstSceneInput,
} from "../../types/shorts";

interface SceneFormData {
  text: string;
  searchTerms: string;
  imageId?: string;
  imageUrl?: string;
  audioId?: string;
  audioUrl?: string;
  audioMode?: "text" | "audio"; // "text" para texto, "audio" para audio subido
}

interface ImageData {
  id: string;
  filename: string;
}

interface AudioData {
  id: string;
  filename: string;
}

const fetchVoices = async (): Promise<VoiceEnum[]> => {
  const response = await axios.get("/api/voices");
  return response.data;
};

const fetchMusicTags = async (): Promise<MusicMoodEnum[]> => {
  const response = await axios.get("/api/music-tags");
  return response.data;
};

const fetchImages = async (): Promise<ImageData[]> => {
  const response = await axios.get("/api/images");
  return response.data.images || [];
};

const uploadImage = async (file: File): Promise<{ imageId: string }> => {
  const formData = new FormData();
  formData.append("image", file);
  const response = await axios.post("/api/images", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

const fetchAudios = async (): Promise<AudioData[]> => {
  const response = await axios.get("/api/audio");
  return response.data.audios || [];
};

const uploadAudio = async (file: File): Promise<{ audioId: string }> => {
  const formData = new FormData();
  formData.append("audio", file);
  const response = await axios.post("/api/audio", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

const createVideo = async (data: { scenes: SceneInput[] | KenBurstSceneInput[]; config: RenderConfig }, type: "regular" | "ken-burst") => {
  const endpoint = type === "regular" ? "/api/short-video" : "/api/ken-burst-video";
  const response = await axios.post(endpoint, data);
  return response.data;
};

const steps = ["Scenes", "Configuration", "Review"];

// Función para dividir texto automáticamente en escenas
const splitTextIntoScenes = (text: string): string[] => {
  if (!text.trim()) return [];
  
  // Dividir por punto seguido de salto de línea (".\n" o ".\r\n")
  // Usamos lookbehind para mantener el punto en la escena anterior
  let scenes = text.split(/(?<=\.)\s*\r?\n+/);
  
  // Si no hay suficientes escenas (solo 1), intentamos otras estrategias
  if (scenes.length === 1) {
    // Intentar con doble salto de línea
    if (text.includes('\n\n')) {
      scenes = text.split(/\n\n+/);
    }
    // Si aún no hay suficientes, intentar dividir por punto + espacio + mayúscula
    else if (text.match(/\.\s+[A-Z]/)) {
      scenes = text.split(/\.\s+(?=[A-Z])/);
      // Añadir el punto de vuelta a cada escena excepto la última
      scenes = scenes.map((scene, idx) => 
        idx < scenes.length - 1 ? scene + '.' : scene
      );
    }
  }
  
  // Limpiar y filtrar escenas vacías
  return scenes
    .map(scene => scene.trim())
    .filter(scene => scene.length > 0 && scene !== '.');
};

const VideoCreator: React.FC = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [videoType, setVideoType] = useState<"regular" | "ken-burst">("regular");
  const [scenes, setScenes] = useState<SceneFormData[]>([
    { text: "", searchTerms: "", audioMode: "text" },
  ]);
  const [fullText, setFullText] = useState<string>("");
  const [globalKeywords, setGlobalKeywords] = useState<string>("");
  const [sceneMode, setSceneMode] = useState<"auto" | "manual">("auto");
  const [config, setConfig] = useState<RenderConfig>({
    paddingBack: 1500,
    music: MusicMoodEnum.chill,
    captionPosition: CaptionPositionEnum.center,
    captionBackgroundColor: "#3b82f6",
    voice: VoiceEnum.af_heart,
    orientation: OrientationEnum.portrait,
    musicVolume: MusicVolumeEnum.high,
  });

  const { data: voices = [], isLoading: loadingVoices } = useQuery({
    queryKey: ["voices"],
    queryFn: fetchVoices,
  });

  const { data: musicTags = [], isLoading: loadingMusicTags } = useQuery({
    queryKey: ["musicTags"],
    queryFn: fetchMusicTags,
  });

  const { data: availableImages = [], refetch: refetchImages } = useQuery({
    queryKey: ["images"],
    queryFn: fetchImages,
  });

  const { data: availableAudios = [], refetch: refetchAudios } = useQuery({
    queryKey: ["audios"],
    queryFn: fetchAudios,
  });

  const uploadImageMutation = useMutation({
    mutationFn: uploadImage,
    onSuccess: () => {
      refetchImages();
    },
  });

  const uploadAudioMutation = useMutation({
    mutationFn: uploadAudio,
    onSuccess: () => {
      refetchAudios();
    },
  });

  const createVideoMutation = useMutation({
    mutationFn: (data: { scenes: SceneInput[] | KenBurstSceneInput[]; config: RenderConfig }) =>
      createVideo(data, videoType),
    onSuccess: (data) => {
      navigate(`/video/${data.videoId}`);
    },
  });

  // Función para distribuir keywords de forma rotativa
  const getRotatedKeywords = useCallback((keywords: string[], sceneIndex: number): string => {
    if (keywords.length === 0) return 'nature, landscape, beautiful';
    
    // Rotar el array según el índice de la escena
    const rotated = [...keywords];
    for (let i = 0; i < sceneIndex; i++) {
      rotated.push(rotated.shift()!);
    }
    
    return rotated.join(', ');
  }, []);

  // Función para generar escenas automáticamente desde el texto completo
  const handleGenerateScenes = useCallback(() => {
    const textScenes = splitTextIntoScenes(fullText);
    
    if (textScenes.length === 0) {
      return;
    }
    
    // Procesar keywords globales
    const keywordsArray = globalKeywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    
    // Generar escenas con el texto dividido
    const newScenes: SceneFormData[] = textScenes.map((text, index) => {
      // Usar keywords rotativas si están disponibles, sino usar default
      const searchTerms = keywordsArray.length > 0 
        ? getRotatedKeywords(keywordsArray, index)
        : 'nature, landscape, beautiful';
      
      return {
        text: text.trim(),
        searchTerms: searchTerms,
        audioMode: "text" as const,
      };
    });
    
    setScenes(newScenes);
  }, [fullText, globalKeywords, getRotatedKeywords]);

  const handleFullTextChange = useCallback((text: string) => {
    setFullText(text);
    // Si hay texto, cambiar a modo auto
    if (text.trim()) {
      setSceneMode("auto");
    }
  }, []);

  const handleAddScene = useCallback(() => {
    setScenes([...scenes, { text: "", searchTerms: "", audioMode: "text" }]);
  }, [scenes]);

  const handleRemoveScene = useCallback((index: number) => {
    if (scenes.length > 1) {
      const newScenes = [...scenes];
      newScenes.splice(index, 1);
      setScenes(newScenes);
    }
  }, [scenes]);

  const handleSceneChange = useCallback((
    index: number,
    field: keyof SceneFormData,
    value: string,
  ) => {
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], [field]: value };
    setScenes(newScenes);
  }, [scenes]);

  const handleConfigChange = useCallback((field: keyof RenderConfig, value: any) => {
    setConfig({ ...config, [field]: value });
  }, [config]);

  const handleImageUpload = useCallback(async (index: number, file: File) => {
    try {
      const result = await uploadImageMutation.mutateAsync(file);
      const newScenes = [...scenes];
      newScenes[index] = {
        ...newScenes[index],
        imageId: result.imageId,
        imageUrl: `/api/images/${result.imageId}`,
      };
      setScenes(newScenes);
    } catch (err) {
      console.error("Failed to upload image:", err);
    }
  }, [scenes, uploadImageMutation]);

  const handleAudioUpload = useCallback(async (index: number, file: File) => {
    try {
      const result = await uploadAudioMutation.mutateAsync(file);
      const newScenes = [...scenes];
      newScenes[index] = {
        ...newScenes[index],
        audioId: result.audioId,
        audioUrl: `/api/audio/${result.audioId}`,
        audioMode: "audio" as const,
      };
      setScenes(newScenes);
    } catch (err) {
      console.error("Failed to upload audio:", err);
    }
  }, [scenes, uploadAudioMutation]);

  const validateScenes = useMemo(() => {
    return scenes.every((scene) => {
      // Validar que tenga texto o audio según el modo
      if (scene.audioMode === "audio") {
        if (!scene.audioId) return false;
      } else {
        if (!scene.text.trim()) return false;
      }
      
      if (videoType === "regular") {
        return scene.searchTerms.trim().length > 0;
      } else {
        return !!scene.imageId;
      }
    });
  }, [scenes, videoType]);

  const handleNext = () => {
    if (activeStep === 0 && !validateScenes) return;
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateScenes) {
      setActiveStep(0);
      return;
    }

    try {
      if (videoType === "regular") {
        const apiScenes: SceneInput[] = scenes.map((scene) => {
          const baseScene: any = {
            searchTerms: scene.searchTerms
              .split(",")
              .map((term) => term.trim())
              .filter((term) => term.length > 0),
          };
          
          // Si tiene audioId, usar audio, sino usar text
          if (scene.audioMode === "audio" && scene.audioId) {
            baseScene.audioId = scene.audioId;
          } else {
            baseScene.text = scene.text;
          }
          
          return baseScene;
        });

        createVideoMutation.mutate({
          scenes: apiScenes,
          config,
        });
      } else {
        const apiScenes: KenBurstSceneInput[] = scenes.map((scene) => ({
          text: scene.text,
          imageId: scene.imageId!,
        }));

        createVideoMutation.mutate({
          scenes: apiScenes,
          config,
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isLoading = loadingVoices || loadingMusicTags;
  const error = createVideoMutation.error || uploadImageMutation.error;

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box maxWidth="lg" mx="auto" py={4} className="fade-in">
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700, mb: 1 }}>
        Create New Video
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Create engaging short videos with AI-powered text-to-speech, captions, and background music
      </Typography>

      <Box display="flex" justifyContent="center" mb={4}>
        <ToggleButtonGroup
          value={videoType}
          exclusive
          onChange={(_, value) => {
            if (value) {
              setVideoType(value);
              setScenes([{ text: "", searchTerms: "" }]);
              setFullText("");
              setGlobalKeywords("");
              setSceneMode("auto");
            }
          }}
          sx={{
            '& .MuiToggleButton-root': {
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
            },
          }}
        >
          <ToggleButton value="regular">
            <VideoCameraBackIcon sx={{ mr: 1 }} />
            Regular Video
          </ToggleButton>
          <ToggleButton value="ken-burst">
            <ImageIcon sx={{ mr: 1 }} />
            Ken Burns Video
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => createVideoMutation.reset()}>
          {error instanceof Error ? error.message : "Failed to create video. Please try again."}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Fade in={activeStep === 0}>
          <Box>
            {activeStep === 0 && (
              <Paper sx={{ p: 4, mb: 3 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                  <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
                    Video Scenes
                  </Typography>
                  <Box display="flex" gap={2} alignItems="center">
                    <Chip 
                      label={`${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'}`} 
                      color="primary" 
                    />
                    <Chip 
                      label={sceneMode === "auto" ? "Auto Mode" : "Manual Mode"} 
                      color={sceneMode === "auto" ? "success" : "default"}
                      size="small"
                    />
                  </Box>
                </Box>

                <Tabs 
                  value={sceneMode} 
                  onChange={(_, value) => setSceneMode(value)}
                  sx={{ mb: 3 }}
                >
                  <Tab 
                    label="Auto Generate" 
                    value="auto" 
                    icon={<AutoAwesomeIcon />}
                    iconPosition="start"
                  />
                  <Tab 
                    label="Manual" 
                    value="manual"
                    icon={<ContentCopyIcon />}
                    iconPosition="start"
                  />
                </Tabs>

                {sceneMode === "auto" && (
                  <Box mb={4}>
                    <Paper variant="outlined" sx={{ p: 3, mb: 3, bgcolor: 'background.default' }}>
                      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                        Paste Your Full Text
                      </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Paste your complete text here. The system will automatically split it into scenes 
                        when it detects a period followed by a line break (".\n"). Each scene will become 
                        a separate video segment.
                      </Typography>
                      
                      <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="Full Text"
                            multiline
                            rows={10}
                            value={fullText}
                            onChange={(e) => handleFullTextChange(e.target.value)}
                            placeholder="Paste your complete text here...&#10;&#10;For example:&#10;&#10;This is the first scene.&#10;&#10;This is the second scene.&#10;&#10;This is the third scene."
                            sx={{
                              '& .MuiInputBase-root': {
                                fontFamily: 'monospace',
                                fontSize: '0.875rem',
                              },
                            }}
                          />
                          
                          <TextField
                            fullWidth
                            label="Background Video Keywords"
                            value={globalKeywords}
                            onChange={(e) => setGlobalKeywords(e.target.value)}
                            placeholder="war, tension, nuke"
                            helperText="Enter keywords separated by commas. These will be distributed to all scenes in rotating order (each scene will have all keywords but in different order)."
                            sx={{ mt: 2 }}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <AutoAwesomeIcon fontSize="small" color="action" />
                                </InputAdornment>
                              ),
                            }}
                          />
                          
                          <Box display="flex" gap={2} mt={2}>
                            <Button
                              variant="contained"
                              startIcon={<AutoAwesomeIcon />}
                              onClick={handleGenerateScenes}
                              disabled={!fullText.trim()}
                              fullWidth
                            >
                              Generate Scenes
                            </Button>
                            <Button
                              variant="outlined"
                              onClick={() => {
                                setFullText("");
                                setGlobalKeywords("");
                                setScenes([{ text: "", searchTerms: "" }]);
                              }}
                            >
                              Clear
                            </Button>
                          </Box>
                          {fullText.trim() && (
                            <Alert severity="info" sx={{ mt: 2 }}>
                              {splitTextIntoScenes(fullText).length} scenes will be generated
                              {globalKeywords.trim() && (
                                <Box component="span" sx={{ ml: 1 }}>
                                  with rotating keywords: {globalKeywords.split(',').map(k => k.trim()).filter(k => k).join(', ')}
                                </Box>
                              )}
                            </Alert>
                          )}
                        </Grid>
                        
                        <Grid item xs={12} md={6}>
                          <Box
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              p: 2,
                              bgcolor: 'background.paper',
                              maxHeight: '500px',
                              overflow: 'auto',
                            }}
                          >
                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                              Preview: Generated Scenes
                            </Typography>
                            {scenes.length > 0 && scenes[0].text ? (
                              <Box sx={{ mt: 2 }}>
                                {scenes.map((scene, index) => (
                                  <Paper
                                    key={index}
                                    variant="outlined"
                                    sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}
                                  >
                                    <Typography variant="caption" color="primary" fontWeight={600}>
                                      Scene {index + 1}
                                    </Typography>
                                    <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                                      {scene.text}
                                    </Typography>
                                    {videoType === "regular" && scene.searchTerms && (
                                      <Box sx={{ mt: 1.5 }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                          Keywords (rotated):
                                        </Typography>
                                        <Chip
                                          label={scene.searchTerms}
                                          size="small"
                                          color="primary"
                                          variant="outlined"
                                        />
                                      </Box>
                                    )}
                                  </Paper>
                                ))}
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                                Scenes will appear here after clicking "Generate Scenes"
                              </Typography>
                            )}
                          </Box>
                        </Grid>
                      </Grid>
                    </Paper>
                  </Box>
                )}

                <Divider sx={{ my: 3 }} />

                <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                  <Typography variant="h6" component="h3" sx={{ fontWeight: 600 }}>
                    Scene Details {scenes.length > 0 && `(${scenes.length})`}
                  </Typography>
                  {sceneMode === "manual" && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={handleAddScene}
                    >
                      Add Scene
                    </Button>
                  )}
                </Box>

                {scenes.map((scene, index) => (
                  <Paper
                    key={index}
                    variant="outlined"
                    sx={{ p: 3, mb: 3, bgcolor: 'background.default' }}
                  >
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        Scene {index + 1}
                      </Typography>
                      {scenes.length > 1 && (
                        <IconButton
                          onClick={() => handleRemoveScene(index)}
                          color="error"
                          size="small"
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Box>

                    <Grid container spacing={3}>
                      <Grid item xs={12}>
                        <Box mb={2}>
                          <ToggleButtonGroup
                            value={scene.audioMode || "text"}
                            exclusive
                            onChange={(_, value) => {
                              if (value !== null) {
                                const newScenes = [...scenes];
                                newScenes[index] = {
                                  ...newScenes[index],
                                  audioMode: value,
                                  text: value === "text" ? newScenes[index].text : "",
                                  audioId: value === "audio" ? newScenes[index].audioId : undefined,
                                  audioUrl: value === "audio" ? newScenes[index].audioUrl : undefined,
                                };
                                setScenes(newScenes);
                              }
                            }}
                            aria-label="audio mode"
                            size="small"
                            sx={{ mb: 2 }}
                          >
                            <ToggleButton value="text" aria-label="text mode">
                              <RecordVoiceOverIcon sx={{ mr: 1 }} />
                              Texto (Kokoro)
                            </ToggleButton>
                            <ToggleButton value="audio" aria-label="audio mode">
                              <AudioFileIcon sx={{ mr: 1 }} />
                              Audio Subido
                            </ToggleButton>
                          </ToggleButtonGroup>
                        </Box>

                        {(scene.audioMode || "text") === "text" ? (
                          <TextField
                            fullWidth
                            label="Text (Narration)"
                            multiline
                            rows={4}
                            value={scene.text}
                            onChange={(e) =>
                              handleSceneChange(index, "text", e.target.value)
                            }
                            required
                            helperText="The text that will be converted to speech using Kokoro"
                            error={!scene.text.trim()}
                          />
                        ) : (
                          <Box>
                            <input
                              accept="audio/*"
                              style={{ display: "none" }}
                              id={`audio-upload-${index}`}
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleAudioUpload(index, file);
                                }
                              }}
                            />
                            <label htmlFor={`audio-upload-${index}`}>
                              <Button
                                variant="outlined"
                                component="span"
                                startIcon={
                                  uploadAudioMutation.isPending ? (
                                    <CircularProgress size={20} />
                                  ) : (
                                    <CloudUploadIcon />
                                  )
                                }
                                disabled={uploadAudioMutation.isPending}
                                sx={{ mb: 2 }}
                                fullWidth
                              >
                                {scene.audioUrl
                                  ? "Cambiar Audio"
                                  : "Subir Audio"}
                              </Button>
                            </label>
                            {scene.audioUrl && (
                              <Fade in>
                                <Box sx={{ mt: 2 }}>
                                  <Alert severity="success" sx={{ mb: 2 }}>
                                    Audio subido correctamente: {availableAudios.find(a => a.id === scene.audioId)?.filename || scene.audioId}
                                  </Alert>
                                  <audio controls src={scene.audioUrl} style={{ width: "100%" }} />
                                </Box>
                              </Fade>
                            )}
                            {!scene.audioUrl && (
                              <FormHelperText>
                                Sube un archivo de audio (MP3, WAV, M4A, OGG, WEBM) para usar tu propia voz en lugar de generar texto con Kokoro
                              </FormHelperText>
                            )}
                          </Box>
                        )}
                      </Grid>

                      {videoType === "regular" ? (
                        <Grid item xs={12}>
                          <TextField
                            fullWidth
                            label="Search Terms"
                            value={scene.searchTerms}
                            onChange={(e) =>
                              handleSceneChange(index, "searchTerms", e.target.value)
                            }
                            helperText="Enter keywords for background video, separated by commas (e.g., nature, ocean, sunset)"
                            required
                            error={!scene.searchTerms.trim()}
                            placeholder="nature, ocean, sunset"
                          />
                        </Grid>
                      ) : (
                        <Grid item xs={12}>
                          <Box>
                            <input
                              accept="image/*"
                              style={{ display: "none" }}
                              id={`image-upload-${index}`}
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleImageUpload(index, file);
                                }
                              }}
                            />
                            <label htmlFor={`image-upload-${index}`}>
                              <Button
                                variant="outlined"
                                component="span"
                                startIcon={
                                  uploadImageMutation.isPending ? (
                                    <CircularProgress size={20} />
                                  ) : (
                                    <CloudUploadIcon />
                                  )
                                }
                                disabled={uploadImageMutation.isPending}
                                sx={{ mb: 2 }}
                              >
                                {scene.imageUrl
                                  ? "Change Image"
                                  : "Upload Image"}
                              </Button>
                            </label>
                            {scene.imageUrl && (
                              <Fade in>
                                <Card sx={{ mt: 2 }}>
                                  <CardMedia
                                    component="img"
                                    height="200"
                                    image={scene.imageUrl}
                                    alt={`Scene ${index + 1} image`}
                                    sx={{ objectFit: 'contain' }}
                                  />
                                </Card>
                              </Fade>
                            )}
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </Paper>
                ))}

                {sceneMode === "manual" && (
                  <Box display="flex" justifyContent="center">
                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={handleAddScene}
                    >
                      Add Scene
                    </Button>
                  </Box>
                )}

                {!validateScenes && (
                  <Alert severity="warning" sx={{ mt: 3 }}>
                    Please fill in all required fields for each scene before continuing.
                  </Alert>
                )}
              </Paper>
            )}
          </Box>
        </Fade>

        <Fade in={activeStep === 1}>
          <Box>
            {activeStep === 1 && (
              <Paper sx={{ p: 4, mb: 3 }}>
                <Box display="flex" alignItems="center" mb={3}>
                  <SettingsIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
                    Video Configuration
                  </Typography>
                </Box>

                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      type="number"
                      label="End Screen Padding"
                      value={config.paddingBack}
                      onChange={(e) =>
                        handleConfigChange("paddingBack", parseInt(e.target.value) || 0)
                      }
                      InputProps={{
                        endAdornment: <InputAdornment position="end">ms</InputAdornment>,
                      }}
                      helperText="Duration to keep playing after narration ends"
                      required
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Music Mood</InputLabel>
                      <Select
                        value={config.music}
                        onChange={(e) => handleConfigChange("music", e.target.value)}
                        label="Music Mood"
                        required
                      >
                        {musicTags.map((tag) => (
                          <MenuItem key={tag} value={tag}>
                            {tag}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Caption Position</InputLabel>
                      <Select
                        value={config.captionPosition}
                        onChange={(e) =>
                          handleConfigChange("captionPosition", e.target.value)
                        }
                        label="Caption Position"
                        required
                      >
                        {Object.values(CaptionPositionEnum).map((position) => (
                          <MenuItem key={position} value={position}>
                            {position}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Caption Background Color"
                      value={config.captionBackgroundColor}
                      onChange={(e) =>
                        handleConfigChange("captionBackgroundColor", e.target.value)
                      }
                      helperText="Any valid CSS color (name, hex, rgba)"
                      required
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Voice</InputLabel>
                      <Select
                        value={config.voice}
                        onChange={(e) => handleConfigChange("voice", e.target.value)}
                        label="Voice"
                        required
                      >
                        {voices.map((voice) => (
                          <MenuItem key={voice} value={voice}>
                            {voice}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Orientation</InputLabel>
                      <Select
                        value={config.orientation}
                        onChange={(e) =>
                          handleConfigChange("orientation", e.target.value)
                        }
                        label="Orientation"
                        required
                      >
                        {Object.values(OrientationEnum).map((orientation) => (
                          <MenuItem key={orientation} value={orientation}>
                            {orientation}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Music Volume</InputLabel>
                      <Select
                        value={config.musicVolume}
                        onChange={(e) =>
                          handleConfigChange("musicVolume", e.target.value)
                        }
                        label="Music Volume"
                        required
                      >
                        {Object.values(MusicVolumeEnum).map((volume) => (
                          <MenuItem key={volume} value={volume}>
                            {volume}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </Paper>
            )}
          </Box>
        </Fade>

        <Fade in={activeStep === 2}>
          <Box>
            {activeStep === 2 && (
              <Paper sx={{ p: 4, mb: 3 }}>
                <Box display="flex" alignItems="center" mb={3}>
                  <CheckCircleIcon sx={{ mr: 1, color: 'success.main' }} />
                  <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
                    Review & Create
                  </Typography>
                </Box>

                <Alert severity="info" sx={{ mb: 3 }}>
                  Review your settings below. Click "Create Video" to start the generation process.
                </Alert>

                <Box mb={3}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Video Type
                  </Typography>
                  <Chip 
                    label={videoType === "regular" ? "Regular Video" : "Ken Burns Video"} 
                    color="primary" 
                  />
                </Box>

                <Box mb={3}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Number of Scenes
                  </Typography>
                  <Typography variant="body1">{scenes.length}</Typography>
                </Box>

                <Box mb={3}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Configuration
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6} sm={4}>
                      <Typography variant="body2" color="text.secondary">Voice</Typography>
                      <Typography variant="body1">{config.voice}</Typography>
                    </Grid>
                    <Grid item xs={6} sm={4}>
                      <Typography variant="body2" color="text.secondary">Music</Typography>
                      <Typography variant="body1">{config.music}</Typography>
                    </Grid>
                    <Grid item xs={6} sm={4}>
                      <Typography variant="body2" color="text.secondary">Orientation</Typography>
                      <Typography variant="body1">{config.orientation}</Typography>
                    </Grid>
                  </Grid>
                </Box>
              </Paper>
            )}
          </Box>
        </Fade>

        <Box display="flex" justifyContent="space-between" mt={4}>
          <Button
            disabled={activeStep === 0}
            onClick={handleBack}
            size="large"
          >
            Back
          </Button>
          
          {activeStep < steps.length - 1 ? (
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={activeStep === 0 && !validateScenes}
              size="large"
            >
              Next
            </Button>
          ) : (
            <Button
              type="submit"
              variant="contained"
              color="primary"
              size="large"
              disabled={createVideoMutation.isPending || !validateScenes}
              startIcon={
                createVideoMutation.isPending ? (
                  <CircularProgress size={20} color="inherit" />
                ) : null
              }
              sx={{
                boxShadow: '0px 4px 12px rgba(99, 102, 241, 0.3)',
                '&:hover': {
                  boxShadow: '0px 6px 16px rgba(99, 102, 241, 0.4)',
                },
              }}
            >
              {createVideoMutation.isPending ? "Creating..." : "Create Video"}
            </Button>
          )}
        </Box>
      </form>
    </Box>
  );
};

export default VideoCreator;