import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
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
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
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
}

interface ImageData {
  id: string;
  filename: string;
}

const VideoCreator: React.FC = () => {
  const navigate = useNavigate();
  const [videoType, setVideoType] = useState<"regular" | "ken-burst">("regular");
  const [scenes, setScenes] = useState<SceneFormData[]>([
    { text: "", searchTerms: "" },
  ]);
  const [config, setConfig] = useState<RenderConfig>({
    paddingBack: 1500,
    music: MusicMoodEnum.chill,
    captionPosition: CaptionPositionEnum.bottom,
    captionBackgroundColor: "blue",
    voice: VoiceEnum.af_heart,
    orientation: OrientationEnum.portrait,
    musicVolume: MusicVolumeEnum.high,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceEnum[]>([]);
  const [musicTags, setMusicTags] = useState<MusicMoodEnum[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [uploadingImage, setUploadingImage] = useState<number | null>(null);
  const [availableImages, setAvailableImages] = useState<ImageData[]>([]);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [voicesResponse, musicResponse, imagesResponse] = await Promise.all([
          axios.get("/api/voices"),
          axios.get("/api/music-tags"),
          axios.get("/api/images"),
        ]);

        setVoices(voicesResponse.data);
        setMusicTags(musicResponse.data);
        setAvailableImages(imagesResponse.data.images);
      } catch (err) {
        console.error("Failed to fetch options:", err);
        setError(
          "Failed to load voices, music options, or images. Please refresh the page.",
        );
      } finally {
        setLoadingOptions(false);
      }
    };

    fetchOptions();
  }, []);

  const handleAddScene = () => {
    setScenes([...scenes, { text: "", searchTerms: "" }]);
  };

  const handleRemoveScene = (index: number) => {
    if (scenes.length > 1) {
      const newScenes = [...scenes];
      newScenes.splice(index, 1);
      setScenes(newScenes);
    }
  };

  const handleSceneChange = (
    index: number,
    field: keyof SceneFormData,
    value: string,
  ) => {
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], [field]: value };
    setScenes(newScenes);
  };

  const handleConfigChange = (field: keyof RenderConfig, value: any) => {
    setConfig({ ...config, [field]: value });
  };

  const handleImageUpload = async (index: number, file: File) => {
    setUploadingImage(index);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await axios.post("/api/images", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const newScenes = [...scenes];
      newScenes[index] = {
        ...newScenes[index],
        imageId: response.data.imageId,
        imageUrl: `/api/images/${response.data.imageId}`,
      };
      setScenes(newScenes);

      // Refresh available images
      const imagesResponse = await axios.get("/api/images");
      setAvailableImages(imagesResponse.data.images);
    } catch (err) {
      console.error("Failed to upload image:", err);
      setError("Failed to upload image. Please try again.");
    } finally {
      setUploadingImage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (videoType === "regular") {
        // Convert scenes to the expected API format for regular videos
        const apiScenes: SceneInput[] = scenes.map((scene) => ({
          text: scene.text,
          searchTerms: scene.searchTerms
            .split(",")
            .map((term) => term.trim())
            .filter((term) => term.length > 0),
        }));

        const response = await axios.post("/api/short-video", {
          scenes: apiScenes,
          config,
        });

        navigate(`/video/${response.data.videoId}`);
      } else {
        // Convert scenes to the expected API format for ken burst videos
        const apiScenes: KenBurstSceneInput[] = scenes.map((scene) => ({
          text: scene.text,
          imageId: scene.imageId!,
        }));

        const response = await axios.post("/api/ken-burst-video", {
          scenes: apiScenes,
          config,
        });

        navigate(`/video/${response.data.videoId}`);
      }
    } catch (err) {
      setError("Failed to create video. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loadingOptions) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="80vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box maxWidth="md" mx="auto" py={4}>
      <Typography variant="h4" component="h1" gutterBottom>
        Create New Video
      </Typography>

      <Box display="flex" justifyContent="center" mb={4}>
        <ToggleButtonGroup
          value={videoType}
          exclusive
          onChange={(_, value) => {
            if (value) {
              setVideoType(value);
              // Reset scenes when switching video type
              setScenes([{ text: "", searchTerms: "" }]);
            }
          }}
        >
          <ToggleButton value="regular">Regular Video</ToggleButton>
          <ToggleButton value="ken-burst">Ken Burst Video</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Typography variant="h5" component="h2" gutterBottom>
          Scenes
        </Typography>

        {scenes.map((scene, index) => (
          <Paper key={index} sx={{ p: 3, mb: 3 }}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h6">Scene {index + 1}</Typography>
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
                <TextField
                  fullWidth
                  label="Text"
                  multiline
                  rows={4}
                  value={scene.text}
                  onChange={(e) =>
                    handleSceneChange(index, "text", e.target.value)
                  }
                  required
                />
              </Grid>

              {videoType === "regular" ? (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Search Terms (comma-separated)"
                    value={scene.searchTerms}
                    onChange={(e) =>
                      handleSceneChange(index, "searchTerms", e.target.value)
                    }
                    helperText="Enter keywords for background video, separated by commas"
                    required
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
                        startIcon={<CloudUploadIcon />}
                        disabled={uploadingImage === index}
                      >
                        {uploadingImage === index ? (
                          <CircularProgress size={24} />
                        ) : scene.imageUrl ? (
                          "Change Image"
                        ) : (
                          "Upload Image"
                        )}
                      </Button>
                    </label>
                    {scene.imageUrl && (
                      <Box mt={2}>
                        <Card>
                          <CardMedia
                            component="img"
                            height="200"
                            image={scene.imageUrl}
                            alt={`Scene ${index + 1} image`}
                          />
                        </Card>
                      </Box>
                    )}
                  </Box>
                </Grid>
              )}
            </Grid>
          </Paper>
        ))}

        <Box display="flex" justifyContent="center" mb={4}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddScene}
          >
            Add Scene
          </Button>
        </Box>

        <Divider sx={{ mb: 4 }} />

        <Typography variant="h5" component="h2" gutterBottom>
          Video Configuration
        </Typography>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="End Screen Padding (ms)"
                value={config.paddingBack}
                onChange={(e) =>
                  handleConfigChange("paddingBack", parseInt(e.target.value))
                }
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">ms</InputAdornment>
                  ),
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
                  {Object.values(MusicMoodEnum).map((tag) => (
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
                <InputLabel>Default Voice</InputLabel>
                <Select
                  value={config.voice}
                  onChange={(e) => handleConfigChange("voice", e.target.value)}
                  label="Default Voice"
                  required
                >
                  {Object.values(VoiceEnum).map((voice) => (
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
                <InputLabel>Volume of the background audio</InputLabel>
                <Select
                  value={config.musicVolume}
                  onChange={(e) =>
                    handleConfigChange("musicVolume", e.target.value)
                  }
                  label="Volume of the background audio"
                  required
                >
                  {Object.values(MusicVolumeEnum).map((voice) => (
                    <MenuItem key={voice} value={voice}>
                      {voice}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Paper>

        <Box display="flex" justifyContent="center">
          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="large"
            disabled={loading || (videoType === "ken-burst" && scenes.some(s => !s.imageId))}
            sx={{ minWidth: 200 }}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Create Video"
            )}
          </Button>
        </Box>
      </form>
    </Box>
  );
};

export default VideoCreator;
