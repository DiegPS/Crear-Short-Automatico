import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import EditIcon from "@mui/icons-material/Edit";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { splitTextIntoScenes } from "./VideoCreator";

interface GenerateScriptResponse {
  scripts: string[];
  topic: string;
  language: string;
}

const generateScript = async (data: {
  topic: string;
  language: string;
  videoType: "short" | "long";
  numScripts: number;
}): Promise<GenerateScriptResponse> => {
  const response = await axios.post("/api/generate-script", data);
  return response.data;
};

const ScriptGenerator: React.FC = () => {
  const navigate = useNavigate();
  const [topic, setTopic] = useState<string>("");
  const [language, setLanguage] = useState<"es" | "en">("es");
  const [videoType, setVideoType] = useState<"short" | "long">("short");
  const [selectedScript, setSelectedScript] = useState<string | null>(null);
  const [editedScript, setEditedScript] = useState<string>("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const generateMutation = useMutation({
    mutationFn: generateScript,
  });

  const handleGenerate = () => {
    if (!topic.trim()) {
      return;
    }
    generateMutation.mutate({
      topic: topic.trim(),
      language,
      videoType,
      numScripts: videoType === "short" ? 3 : 1,
    });
  };

  const handleSelectScript = (script: string) => {
    setSelectedScript(script);
    setEditedScript(script);
    setEditDialogOpen(true);
  };

  const handleConfirmScript = () => {
    if (!editedScript.trim()) {
      return;
    }

    // Dividir el guion en escenas
    const scenes = splitTextIntoScenes(editedScript);

    if (scenes.length === 0) {
      alert("El guion no pudo ser dividido en escenas. Por favor, edítalo para que tenga múltiples oraciones separadas por puntos y saltos de línea.");
      return;
    }

    // Preparar los datos para VideoCreator
    const sceneData = scenes.map((scene) => ({
      text: scene.trim(),
      searchTerms: "",
      audioMode: "text" as const,
    }));

    // Pasar a VideoCreator con los datos iniciales
    navigate("/create", {
      state: {
        initialScenes: sceneData,
        initialTitle: topic,
        initialLanguage: language,
        skipToConfig: true, // Saltar directamente a configuración
      },
    });
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: 3 }}>
      <Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2 }}>
        <IconButton onClick={() => navigate("/")} color="primary">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1">
          Generador de Guiones con IA
        </Typography>
        <AutoAwesomeIcon sx={{ fontSize: 32, color: "primary.main" }} />
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Tema del Video"
              placeholder="Ej: Los beneficios de la meditación, Curiosidades sobre el espacio, Tips para ahorrar dinero..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              multiline
              rows={2}
              helperText="Describe el tema sobre el cual quieres que se genere el guion"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Idioma</InputLabel>
              <Select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "es" | "en")}
                label="Idioma"
              >
                <MenuItem value="es">Español</MenuItem>
                <MenuItem value="en">English</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Tipo de Video</InputLabel>
              <Select
                value={videoType}
                onChange={(e) => setVideoType(e.target.value as "short" | "long")}
                label="Tipo de Video"
              >
                <MenuItem value="short">Video Corto (Shorts/Reels)</MenuItem>
                <MenuItem value="long">Video Largo</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <Button
              variant="contained"
              size="large"
              onClick={handleGenerate}
              disabled={!topic.trim() || generateMutation.isPending}
              startIcon={
                generateMutation.isPending ? (
                  <CircularProgress size={20} />
                ) : (
                  <AutoAwesomeIcon />
                )
              }
              sx={{ minWidth: 200 }}
            >
              {generateMutation.isPending
                ? "Generando Guiones..."
                : "Generar Guiones con IA"}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {generateMutation.isError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {generateMutation.error instanceof Error
            ? generateMutation.error.message
            : "Error al generar los guiones. Asegúrate de que GOOGLE_GENERATIVE_AI_API_KEY esté configurada."}
        </Alert>
      )}

      {generateMutation.isSuccess && generateMutation.data.scripts.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Guiones Generados ({generateMutation.data.scripts.length})
          </Typography>
          <Grid container spacing={2}>
            {generateMutation.data.scripts.map((script, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Card
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    cursor: "pointer",
                    transition: "transform 0.2s, box-shadow 0.2s",
                    "&:hover": {
                      transform: "translateY(-4px)",
                      boxShadow: 4,
                    },
                  }}
                  onClick={() => handleSelectScript(script)}
                >
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 2,
                      }}
                    >
                      <Typography variant="h6" component="h3">
                        Guion {index + 1}
                      </Typography>
                      <IconButton
                        color="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectScript(script);
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        whiteSpace: "pre-wrap",
                        maxHeight: 200,
                        overflow: "auto",
                      }}
                    >
                      {script}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Dialog para editar el guion */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <EditIcon />
            <Typography variant="h6">Editar Guion</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={12}
            value={editedScript}
            onChange={(e) => setEditedScript(e.target.value)}
            placeholder="Edita el guion aquí. Cada escena debe estar separada por un punto seguido de salto de línea."
            sx={{ mt: 2 }}
          />
          <Alert severity="info" sx={{ mt: 2 }}>
            Cada escena debe estar separada por un punto seguido de salto de línea
            (.\n). El guion se dividirá automáticamente en escenas al continuar.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
          <Button
            onClick={handleConfirmScript}
            variant="contained"
            startIcon={<CheckCircleIcon />}
            disabled={!editedScript.trim()}
          >
            Usar este Guion
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ScriptGenerator;

