import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import fs from "fs-extra";
import path from "path";
import cuid from "cuid";
import fileUpload from "express-fileupload";

import { validateCreateShortInput, validateCreateKenBurstInput } from "../validator";
import { ShortCreator } from "../../short-creator/ShortCreator";
import { logger } from "../../logger";
import { Config } from "../../config";
import { KenBurstSceneInput, RenderConfig } from "../../types/shorts";

// Extend Express Request type to include files
interface FileUploadRequest extends ExpressRequest {
  files?: fileUpload.FileArray;
}

export class APIRouter {
  public router: express.Router;
  private shortCreator: ShortCreator;
  private config: Config;

  constructor(config: Config, shortCreator: ShortCreator) {
    this.config = config;
    this.router = express.Router();
    this.shortCreator = shortCreator;

    this.router.use(express.json());
    this.router.use(fileUpload());
    this.setupRoutes();
  }

  private setupRoutes() {
    this.router.post(
      "/short-video",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const input = validateCreateShortInput(req.body);

          logger.info({ input }, "Creating short video");

          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
          );

          res.status(201).json({
            videoId,
          });
        } catch (error: unknown) {
          logger.error(error, "Error validating input");

          // Handle validation errors specifically
          if (error instanceof Error && error.message.startsWith("{")) {
            try {
              const errorData = JSON.parse(error.message);
              res.status(400).json({
                error: "Validation failed",
                message: errorData.message,
                missingFields: errorData.missingFields,
              });
              return;
            } catch (parseError: unknown) {
              logger.error(parseError, "Error parsing validation error");
            }
          }

          // Fallback for other errors
          res.status(400).json({
            error: "Invalid input",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    this.router.get(
      "/short-video/:videoId/status",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }
        const statusResult = this.shortCreator.status(videoId);
        // Handle both old format (string) and new format (object with progress)
        if (typeof statusResult === 'string') {
          res.status(200).json({
            status: statusResult,
          });
        } else {
          res.status(200).json(statusResult);
        }
      },
    );

    this.router.get(
      "/music-tags",
      (req: ExpressRequest, res: ExpressResponse) => {
        res.status(200).json(this.shortCreator.ListAvailableMusicTags());
      },
    );

    this.router.get("/voices", (req: ExpressRequest, res: ExpressResponse) => {
      res.status(200).json(this.shortCreator.ListAvailableVoices());
    });

    this.router.get(
      "/short-videos",
      (req: ExpressRequest, res: ExpressResponse) => {
        const videos = this.shortCreator.listAllVideos();
        res.status(200).json({
          videos,
        });
      },
    );

    this.router.delete(
      "/short-video/:videoId",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }
        this.shortCreator.deleteVideo(videoId);
        res.status(200).json({
          success: true,
        });
      },
    );

    this.router.get(
      "/tmp/:tmpFile",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { tmpFile } = req.params;
        if (!tmpFile) {
          res.status(400).json({
            error: "tmpFile is required",
          });
          return;
        }
        const tmpFilePath = path.join(this.config.tempDirPath, tmpFile);
        if (!fs.existsSync(tmpFilePath)) {
          res.status(404).json({
            error: "tmpFile not found",
          });
          return;
        }

        if (tmpFile.endsWith(".mp3")) {
          res.setHeader("Content-Type", "audio/mpeg");
        }
        if (tmpFile.endsWith(".wav")) {
          res.setHeader("Content-Type", "audio/wav");
        }

        const tmpFileStream = fs.createReadStream(tmpFilePath);
        tmpFileStream.on("error", (error) => {
          logger.error(error, "Error reading tmp file");
          res.status(500).json({
            error: "Error reading tmp file",
            tmpFile,
          });
        });
        tmpFileStream.pipe(res);
      },
    );

    this.router.get(
      "/music/:fileName",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { fileName } = req.params;
        if (!fileName) {
          res.status(400).json({
            error: "fileName is required",
          });
          return;
        }
        const musicFilePath = path.join(this.config.musicDirPath, fileName);
        if (!fs.existsSync(musicFilePath)) {
          res.status(404).json({
            error: "music file not found",
          });
          return;
        }
        const musicFileStream = fs.createReadStream(musicFilePath);
        musicFileStream.on("error", (error) => {
          logger.error(error, "Error reading music file");
          res.status(500).json({
            error: "Error reading music file",
            fileName,
          });
        });
        musicFileStream.pipe(res);
      },
    );

    this.router.get(
      "/short-video/:videoId",
      (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { videoId } = req.params;
          if (!videoId) {
            res.status(400).json({
              error: "videoId is required",
            });
            return;
          }
          const video = this.shortCreator.getVideo(videoId);
          res.setHeader("Content-Type", "video/mp4");
          res.setHeader(
            "Content-Disposition",
            `inline; filename=${videoId}.mp4`,
          );
          res.send(video);
        } catch (error: unknown) {
          logger.error(error, "Error getting video");
          res.status(404).json({
            error: "Video not found",
          });
        }
      },
    );

    // Image management endpoints
    this.router.post(
      "/images",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const fileReq = req as FileUploadRequest;
        try {
          if (!fileReq.files || !fileReq.files.image) {
            res.status(400).json({
              error: "No image file provided",
            });
            return;
          }

          const imageFile = fileReq.files.image;
          if (Array.isArray(imageFile)) {
            res.status(400).json({
              error: "Multiple files not allowed",
            });
            return;
          }

          const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
          if (!allowedTypes.includes(imageFile.mimetype)) {
            res.status(400).json({
              error: "Invalid file type. Only JPEG, PNG and GIF are allowed.",
            });
            return;
          }

          if (imageFile.size > 5 * 1024 * 1024) { // 5MB limit
            res.status(400).json({
              error: "File size too large. Maximum size is 5MB.",
            });
            return;
          }

          const ext = path.extname(imageFile.name);
          const imageId = cuid();
          const filename = `${imageId}${ext}`;
          const filepath = path.join(this.config.imagesDirPath, filename);

          await imageFile.mv(filepath);
          res.status(201).json({
            imageId,
          });
        } catch (error: unknown) {
          logger.error(error, "Error uploading image");
          res.status(400).json({
            error: "Failed to upload image",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    this.router.get(
      "/images/:imageId",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { imageId } = req.params;
          if (!imageId) {
            res.status(400).json({
              error: "imageId is required",
            });
            return;
          }

          const files = await fs.readdir(this.config.imagesDirPath);
          const imageFile = files.find(file => file.startsWith(imageId));

          if (!imageFile) {
            res.status(404).json({
              error: "Image not found",
            });
            return;
          }

          const fullPath = path.join(this.config.imagesDirPath, imageFile);
          const ext = path.extname(imageFile).toLowerCase();
          const mimeType = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
          }[ext] || 'application/octet-stream';

          res.setHeader('Content-Type', mimeType);
          res.sendFile(fullPath);
        } catch (error: unknown) {
          logger.error(error, "Error getting image");
          res.status(404).json({
            error: "Image not found",
          });
        }
      },
    );

    this.router.get(
      "/images",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const images = this.shortCreator.listAllImages();
          res.status(200).json({ 
            images,
            total: images.length,
            processing: images.filter(img => img.status === "processing").length,
            ready: images.filter(img => img.status === "ready").length
          });
        } catch (error: unknown) {
          logger.error(error, "Error listing images");
          res.status(500).json({
            error: "Failed to list images",
          });
        }
      },
    );

    this.router.delete(
      "/images/:imageId",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { imageId } = req.params;
          if (!imageId) {
            res.status(400).json({
              error: "imageId is required",
            });
            return;
          }

          this.shortCreator.deleteImage(imageId);
          res.status(200).json({ success: true });
        } catch (error: unknown) {
          logger.error(error, "Error deleting image");
          res.status(404).json({
            error: "Image not found",
          });
        }
      },
    );

    this.router.post(
      "/ken-burst-video",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const input = validateCreateKenBurstInput(req.body);
          const videoId = this.shortCreator.addKenBurstToQueue(
            input.scenes,
            input.config,
          );

          res.status(201).json({
            videoId,
          });
        } catch (error: unknown) {
          logger.error(error, "Error validating input");

          if (error instanceof Error && error.message.startsWith("{")) {
            try {
              const errorData = JSON.parse(error.message);
              res.status(400).json({
                error: "Validation failed",
                message: errorData.message,
                missingFields: errorData.missingFields,
              });
              return;
            } catch (parseError: unknown) {
              logger.error(parseError, "Error parsing validation error");
            }
          }

          res.status(400).json({
            error: "Invalid input",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    // Audio management endpoints
    this.router.post(
      "/audio",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const fileReq = req as FileUploadRequest;
        try {
          if (!fileReq.files || !fileReq.files.audio) {
            res.status(400).json({
              error: "No audio file provided",
            });
            return;
          }

          const audioFile = fileReq.files.audio;
          if (Array.isArray(audioFile)) {
            res.status(400).json({
              error: "Multiple files not allowed",
            });
            return;
          }

          const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/webm'];
          if (!allowedTypes.includes(audioFile.mimetype)) {
            res.status(400).json({
              error: "Invalid file type. Only MP3, WAV, M4A, OGG and WEBM are allowed.",
            });
            return;
          }

          if (audioFile.size > 50 * 1024 * 1024) { // 50MB limit
            res.status(400).json({
              error: "File size too large. Maximum size is 50MB.",
            });
            return;
          }

          const ext = path.extname(audioFile.name);
          const audioId = cuid();
          const filename = `${audioId}${ext}`;
          const filepath = path.join(this.config.audioDirPath, filename);

          await audioFile.mv(filepath);
          res.status(201).json({
            audioId,
          });
        } catch (error: unknown) {
          logger.error(error, "Error uploading audio");
          res.status(400).json({
            error: "Failed to upload audio",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    this.router.get(
      "/audio/:audioId",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { audioId } = req.params;
          if (!audioId) {
            res.status(400).json({
              error: "audioId is required",
            });
            return;
          }

          const files = await fs.readdir(this.config.audioDirPath);
          const audioFile = files.find(file => file.startsWith(audioId));

          if (!audioFile) {
            res.status(404).json({
              error: "Audio not found",
            });
            return;
          }

          const fullPath = path.join(this.config.audioDirPath, audioFile);
          const ext = path.extname(audioFile).toLowerCase();
          const mimeType = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.wave': 'audio/wav',
            '.m4a': 'audio/mp4',
            '.ogg': 'audio/ogg',
            '.webm': 'audio/webm',
          }[ext] || 'application/octet-stream';

          res.setHeader('Content-Type', mimeType);
          res.sendFile(fullPath);
        } catch (error: unknown) {
          logger.error(error, "Error getting audio");
          res.status(404).json({
            error: "Audio not found",
          });
        }
      },
    );

    this.router.get(
      "/audio",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const audios = this.shortCreator.listAllAudios();
          res.status(200).json({ 
            audios,
            total: audios.length,
            processing: audios.filter(audio => audio.status === "processing").length,
            ready: audios.filter(audio => audio.status === "ready").length
          });
        } catch (error: unknown) {
          logger.error(error, "Error listing audios");
          res.status(500).json({
            error: "Failed to list audios",
          });
        }
      },
    );

    this.router.delete(
      "/audio/:audioId",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { audioId } = req.params;
          if (!audioId) {
            res.status(400).json({
              error: "audioId is required",
            });
            return;
          }

          this.shortCreator.deleteAudio(audioId);
          res.status(200).json({ success: true });
        } catch (error: unknown) {
          logger.error(error, "Error deleting audio");
          res.status(404).json({
            error: "Audio not found",
          });
        }
      },
    );
  }
}
