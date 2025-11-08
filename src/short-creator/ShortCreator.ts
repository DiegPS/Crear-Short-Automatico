import { OrientationEnum } from "./../types/shorts";
/* eslint-disable @remotion/deterministic-randomness */
import fs from "fs-extra";
import cuid from "cuid";
import path from "path";

import { Kokoro } from "./libraries/Kokoro";
import { Remotion } from "./libraries/Remotion";
import { Whisper } from "./libraries/Whisper";
import { FFMpeg } from "./libraries/FFmpeg";
import { PexelsAPI } from "./libraries/Pexels";
import { Config } from "../config";
import { logger } from "../logger";
import { MusicManager } from "./music";
import { type Music } from "../types/shorts";
import { DatabaseManager } from "../database/database";
import type {
  SceneInput,
  RenderConfig,
  Scene,
  VideoStatus,
  MusicMoodEnum,
  MusicTag,
  MusicForVideo,
  KenBurstSceneInput,
} from "../types/shorts";

type ImageStatus = "ready" | "processing";

export class ShortCreator {
  private queue: {
    sceneInput: SceneInput[] | KenBurstSceneInput[];
    config: RenderConfig;
    id: string;
    title?: string;
  }[] = [];
  private progressMap: Map<string, number> = new Map();
  constructor(
    private config: Config,
    private remotion: Remotion,
    private kokoro: Kokoro,
    private whisper: Whisper,
    private ffmpeg: FFMpeg,
    private pexelsApi: PexelsAPI,
    private musicManager: MusicManager,
    private database: DatabaseManager,
  ) {}

  public status(id: string): VideoStatus | { status: VideoStatus; progress?: number } {
    // Primero verificar en la cola (memoria)
    const isInQueue = this.queue.find((item) => item.id === id);
    const progress = this.progressMap.get(id);
    
    if (isInQueue) {
      return { status: "processing", progress };
    }
    
    // Luego verificar en la base de datos
    const dbVideo = this.database.getVideo(id);
    if (dbVideo) {
      // Si está en DB pero no en cola, usar el estado de la DB
      if (dbVideo.status === "processing" && progress !== undefined) {
        return { status: dbVideo.status, progress };
      }
      return dbVideo.status === "processing" 
        ? { status: dbVideo.status, progress: dbVideo.progress } 
        : dbVideo.status;
    }
    
    // Si no está en DB ni en cola, verificar si existe el archivo (fallback)
    const videoPath = this.getVideoPath(id);
    if (fs.existsSync(videoPath)) {
      // Video existe pero no está en DB, agregarlo
      this.database.insertVideo(id, "ready", 100);
      this.progressMap.delete(id);
      return "ready";
    }
    
    // Clean up progress when video failed
    this.progressMap.delete(id);
    return "failed";
  }

  public addToQueue(sceneInput: SceneInput[], config: RenderConfig, title?: string): string {
    // todo add mutex lock
    const id = cuid();
    
    // Guardar en la base de datos
    this.database.insertVideo(id, "processing", 0, title);
    
    this.queue.push({
      sceneInput,
      config,
      id,
      title,
    });
    if (this.queue.length === 1) {
      this.processQueue();
    }
    return id;
  }

  private async processQueue(): Promise<void> {
    // todo add a semaphore
    if (this.queue.length === 0) {
      return;
    }
    const { sceneInput, config, id } = this.queue[0];
    logger.debug(
      { sceneInput, config, id },
      "Processing video item in the queue",
    );
    try {
      await this.createShort(id, sceneInput, config);
      logger.debug({ id }, "Video created successfully");
      // Actualizar estado en DB a "ready"
      this.database.updateVideoStatus(id, "ready", 100);
    } catch (error: unknown) {
      logger.error(error, "Error creating video");
      // Actualizar estado en DB a "failed"
      this.database.updateVideoStatus(id, "failed");
    } finally {
      this.queue.shift();
      this.processQueue();
    }
  }

  private async createShort(
    videoId: string,
    inputScenes: SceneInput[] | KenBurstSceneInput[],
    config: RenderConfig,
  ): Promise<string> {
    logger.debug(
      {
        inputScenes,
        config,
      },
      "Creating short video",
    );
    const scenes: Scene[] = [];
    let totalDuration = 0;
    const excludeVideoIds = [];
    const tempFiles = [];

    const orientation: OrientationEnum =
      config.orientation || OrientationEnum.portrait;

    let index = 0;
    for (const scene of inputScenes) {
      let audioLength: number;
      let audioStream: ArrayBuffer;
      let tempWavPath: string;
      let tempMp3Path: string;
      const tempId = cuid();
      const tempWavFileName = `${tempId}.wav`;
      const tempMp3FileName = `${tempId}.mp3`;
      tempWavPath = path.join(this.config.tempDirPath, tempWavFileName);
      tempMp3Path = path.join(this.config.tempDirPath, tempMp3FileName);
      tempFiles.push(tempWavPath, tempMp3Path);

      // Check if scene has audioId (uploaded audio) or text (Kokoro generation)
      if ('audioId' in scene && scene.audioId) {
        // Use uploaded audio - skip Kokoro
        const audioId = scene.audioId; // Type narrowing
        logger.debug({ audioId }, "Using uploaded audio, skipping Kokoro");
        
        // Find the audio file
        const audioFiles = fs.readdirSync(this.config.audioDirPath);
        const audioFile = audioFiles.find(file => file.startsWith(audioId));
        
        if (!audioFile) {
          throw new Error(`Audio file with ID ${audioId} not found`);
        }

        const audioFilePath = path.join(this.config.audioDirPath, audioFile);
        
        // Get audio duration
        const fullAudioDuration = await this.ffmpeg.getAudioDuration(audioFilePath);
        const maxSegmentDuration = 15; // Maximum 15 seconds per segment
        const minPauseDuration = 500; // Minimum pause duration in ms to consider a cut point
        
        // If audio is longer than maxSegmentDuration, split it intelligently
        if (fullAudioDuration > maxSegmentDuration) {
          logger.debug(
            { audioId, fullAudioDuration, maxSegmentDuration },
            "Audio is too long, splitting into multiple segments intelligently",
          );
          
          // First, transcribe the full audio to get natural pause points
          const fullTempWavPath = path.join(this.config.tempDirPath, `full_${tempId}.wav`);
          tempFiles.push(fullTempWavPath);
          await this.ffmpeg.normalizeAudioFile(audioFilePath, fullTempWavPath);
          const fullCaptions = await this.whisper.CreateCaption(fullTempWavPath, config.language ?? "es");
          
          // Find natural cut points (pauses between captions and sentence endings)
          const cutPoints: number[] = [0]; // Always start at 0
          
          for (let i = 0; i < fullCaptions.length - 1; i++) {
            const currentCaption = fullCaptions[i];
            const nextCaption = fullCaptions[i + 1];
            const pauseDuration = nextCaption.startMs - currentCaption.endMs;
            
            // Check if there's a significant pause (natural break)
            if (pauseDuration >= minPauseDuration) {
              // Also check if it's at the end of a sentence
              const textEndsSentence = /[.!?]\s*$/.test(currentCaption.text.trim());
              if (textEndsSentence || pauseDuration >= minPauseDuration * 2) {
                // Add cut point at the end of current caption (or slightly after)
                const cutPoint = (currentCaption.endMs + 100) / 1000; // Convert to seconds, add small buffer
                if (cutPoint < fullAudioDuration && cutPoint > cutPoints[cutPoints.length - 1] + 3) {
                  // Ensure minimum 3 seconds between cuts
                  cutPoints.push(cutPoint);
                }
              }
            }
          }
          
          // Ensure we don't exceed maxSegmentDuration
          const optimizedCutPoints: number[] = [0];
          let lastCut = 0;
          
          for (let i = 1; i < cutPoints.length; i++) {
            const durationSinceLastCut = cutPoints[i] - lastCut;
            if (durationSinceLastCut > maxSegmentDuration) {
              // Need intermediate cut - find best point before maxSegmentDuration
              const targetCut = lastCut + maxSegmentDuration;
              // Find the closest natural cut point before target
              let bestCut = targetCut;
              for (let j = i - 1; j >= 0 && cutPoints[j] >= lastCut; j--) {
                if (cutPoints[j] <= targetCut && cutPoints[j] > lastCut + 5) {
                  bestCut = cutPoints[j];
                  break;
                }
              }
              optimizedCutPoints.push(bestCut);
              lastCut = bestCut;
              i--; // Re-check this point
            } else if (i === cutPoints.length - 1 || cutPoints[i + 1] - lastCut > maxSegmentDuration) {
              // This is a good cut point
              optimizedCutPoints.push(cutPoints[i]);
              lastCut = cutPoints[i];
            }
          }
          
          // Add final cut point if needed
          if (optimizedCutPoints[optimizedCutPoints.length - 1] < fullAudioDuration - 1) {
            optimizedCutPoints.push(fullAudioDuration);
          }
          
          logger.debug(
            { cutPoints: optimizedCutPoints, originalCutPoints: cutPoints },
            "Determined natural cut points for audio splitting",
          );
          
          // Process each segment as a separate scene
          for (let segmentIndex = 0; segmentIndex < optimizedCutPoints.length - 1; segmentIndex++) {
            const segmentStart = optimizedCutPoints[segmentIndex];
            const segmentLength = optimizedCutPoints[segmentIndex + 1] - segmentStart;
            
            const segmentTempId = cuid();
            const segmentWavFileName = `${segmentTempId}.wav`;
            const segmentMp3FileName = `${segmentTempId}.mp3`;
            const segmentWavPath = path.join(this.config.tempDirPath, segmentWavFileName);
            const segmentMp3Path = path.join(this.config.tempDirPath, segmentMp3FileName);
            tempFiles.push(segmentWavPath, segmentMp3Path);
            
            // Extract audio segment for Whisper
            await this.ffmpeg.splitAudioForWhisper(
              audioFilePath,
              segmentStart,
              segmentLength,
              segmentWavPath,
            );
            
            // Extract audio segment as MP3
            await this.ffmpeg.splitAudioFile(
              audioFilePath,
              segmentStart,
              segmentLength,
              segmentMp3Path,
            );
            
            // Filter captions for this segment (adjust timestamps relative to segment start)
            const segmentStartMs = segmentStart * 1000;
            const segmentEndMs = (segmentStart + segmentLength) * 1000;
            const segmentCaptions = fullCaptions
              .filter(caption => {
                // Caption overlaps with this segment
                return (caption.startMs >= segmentStartMs && caption.startMs < segmentEndMs) ||
                       (caption.endMs > segmentStartMs && caption.endMs <= segmentEndMs) ||
                       (caption.startMs < segmentStartMs && caption.endMs > segmentEndMs);
              })
              .map(caption => ({
                text: caption.text,
                startMs: Math.max(0, caption.startMs - segmentStartMs),
                endMs: Math.min(segmentLength * 1000, caption.endMs - segmentStartMs),
              }));
            
            // Find video for this segment (shorter duration)
            let segmentVideoUrl: string;
            let segmentIsImage = false;
            if ('searchTerms' in scene) {
              const video = await this.pexelsApi.findVideo(
                scene.searchTerms,
                segmentLength,
                excludeVideoIds,
                orientation,
              );
              excludeVideoIds.push(video.id);
              segmentVideoUrl = video.url;
            } else {
              // Handle ken burst scene with image ID
              const kenBurstScene = scene as KenBurstSceneInput;
              segmentIsImage = true;
              segmentVideoUrl = `http://localhost:${this.config.port}/api/images/${kenBurstScene.imageId}`;
            }
            
            // Add padding only to the last segment of the last scene
            const totalSegments = optimizedCutPoints.length - 1;
            let finalSegmentLength = segmentLength;
            if (index + 1 === inputScenes.length && segmentIndex + 1 === totalSegments && config.paddingBack) {
              finalSegmentLength += config.paddingBack / 1000;
            }
            
            scenes.push({
              captions: segmentCaptions,
              video: segmentVideoUrl,
              isImage: segmentIsImage,
              audio: {
                url: `http://localhost:${this.config.port}/api/tmp/${segmentMp3FileName}`,
                duration: finalSegmentLength,
              },
            });
            
            totalDuration += finalSegmentLength;
          }
          
          // Skip the rest of the processing for this scene since we already processed all segments
          index++;
          continue;
        }
        
        // Audio is short enough, process normally
        audioLength = fullAudioDuration;
        
        // Normalize audio for Whisper
        await this.ffmpeg.normalizeAudioFile(audioFilePath, tempWavPath);
        
        // Convert to MP3
        await this.ffmpeg.convertAudioFileToMp3(audioFilePath, tempMp3Path);
        
        // Convert to ArrayBuffer for consistency
        audioStream = await this.ffmpeg.convertAudioFileToArrayBuffer(audioFilePath);
      } else if ('text' in scene && scene.text) {
        // Generate audio using Kokoro (original flow)
        // Pass language to Kokoro so it can use Python for Spanish
        // Ensure language is always set (default from schema is "es")
        const audio = await this.kokoro.generate(
          scene.text,
          config.voice ?? "af_heart",
          config.language ?? "es",
        );
        audioLength = audio.audioLength;
        audioStream = audio.audio;

        await this.ffmpeg.saveNormalizedAudio(audioStream, tempWavPath);
        await this.ffmpeg.saveToMp3(audioStream, tempMp3Path);
      } else {
        throw new Error("Scene must have either 'text' or 'audioId'");
      }

      // Generate captions using Whisper
      // Ensure language is always set (default from schema is "es")
      const captions = await this.whisper.CreateCaption(tempWavPath, config.language ?? "es");

      // add the paddingBack in seconds to the last scene
      if (index + 1 === inputScenes.length && config.paddingBack) {
        audioLength += config.paddingBack / 1000;
      }

      let videoUrl: string;
      let isImage = false;
      if ('searchTerms' in scene) {
        // Handle regular scene with search terms
        const video = await this.pexelsApi.findVideo(
          scene.searchTerms,
          audioLength,
          excludeVideoIds,
          orientation,
        );
        excludeVideoIds.push(video.id);
        videoUrl = video.url;
      } else {
        // Handle ken burst scene with image ID
        isImage = true;
        videoUrl = `http://localhost:${this.config.port}/api/images/${scene.imageId}`;
      }

      scenes.push({
        captions,
        video: videoUrl,
        isImage,
        audio: {
          url: `http://localhost:${this.config.port}/api/tmp/${tempMp3FileName}`,
          duration: audioLength,
        },
      });

      totalDuration += audioLength;
      index++;
    }
    if (config.paddingBack) {
      totalDuration += config.paddingBack / 1000;
    }

    const selectedMusic = this.findMusic(totalDuration, config.music);
    logger.debug({ selectedMusic }, "Selected music for the video");

    // Initialize progress
    this.progressMap.set(videoId, 0);

    await this.remotion.render(
      {
        music: selectedMusic,
        scenes,
        config: {
          durationMs: totalDuration * 1000,
          paddingBack: config.paddingBack,
          ...{
            captionBackgroundColor: config.captionBackgroundColor,
            captionPosition: config.captionPosition,
          },
          musicVolume: config.musicVolume,
        },
      },
      videoId,
      orientation,
      (progress) => {
        // Update progress in the map and database
        const progressPercent = Math.floor(progress * 100);
        this.progressMap.set(videoId, progressPercent);
        this.database.updateVideoStatus(videoId, "processing", progressPercent);
      },
    );

    // Clean up progress when rendering is complete
    this.progressMap.delete(videoId);

    for (const file of tempFiles) {
      fs.removeSync(file);
    }

    return videoId;
  }

  public getVideoPath(videoId: string): string {
    return path.join(this.config.videosDirPath, `${videoId}.mp4`);
  }

  public deleteVideo(videoId: string): void {
    const videoPath = this.getVideoPath(videoId);
    // Eliminar archivo si existe
    if (fs.existsSync(videoPath)) {
      fs.removeSync(videoPath);
      logger.debug({ videoId }, "Deleted video file");
    }
    // Eliminar de la base de datos
    this.database.deleteVideo(videoId);
    logger.debug({ videoId }, "Deleted video from database");
  }

  public deleteImage(imageId: string): void {
    const files = fs.readdirSync(this.config.imagesDirPath);
    const imageFile = files.find(file => file.startsWith(imageId));
    
    // Eliminar archivo si existe
    if (imageFile) {
      const imagePath = path.join(this.config.imagesDirPath, imageFile);
      fs.removeSync(imagePath);
      logger.debug({ imageId }, "Deleted image file");
    }
    
    // Eliminar de la base de datos
    this.database.deleteImage(imageId);
    logger.debug({ imageId }, "Deleted image from database");
  }

  public deleteAudio(audioId: string): void {
    const files = fs.readdirSync(this.config.audioDirPath);
    const audioFile = files.find(file => file.startsWith(audioId));
    
    // Eliminar archivo si existe
    if (audioFile) {
      const audioPath = path.join(this.config.audioDirPath, audioFile);
      fs.removeSync(audioPath);
      logger.debug({ audioId }, "Deleted audio file");
    }
    
    // Eliminar de la base de datos
    this.database.deleteAudio(audioId);
    logger.debug({ audioId }, "Deleted audio from database");
  }

  public listAllAudios(): { id: string; filename: string; status: ImageStatus }[] {
    // Obtener todos los audios de la base de datos
    const dbAudios = this.database.getAllAudios();
    
    // Crear un mapa para actualizar estados de audios en cola
    const audiosMap = new Map<string, { id: string; filename: string; status: ImageStatus }>();
    
    // Agregar audios de la DB
    for (const dbAudio of dbAudios) {
      audiosMap.set(dbAudio.id, {
        id: dbAudio.id,
        filename: dbAudio.filename,
        status: dbAudio.status,
      });
    }
    
    // Actualizar estados de audios que están en la cola (processing)
    for (const queueItem of this.queue) {
      if (Array.isArray(queueItem.sceneInput) && queueItem.sceneInput.length > 0) {
        const scenes = queueItem.sceneInput as SceneInput[];
        for (const scene of scenes) {
          if ('audioId' in scene && scene.audioId) {
            const existing = audiosMap.get(scene.audioId);
            if (existing) {
              existing.status = "processing";
            } else {
              // Audio en cola pero no en DB (no debería pasar, pero por seguridad)
              audiosMap.set(scene.audioId, {
                id: scene.audioId,
                filename: `${scene.audioId} (processing)`,
                status: "processing",
              });
            }
          }
        }
      }
    }
    
    // Convertir mapa a array
    return Array.from(audiosMap.values());
  }

  public getAudio(audioId: string): Buffer {
    const files = fs.readdirSync(this.config.audioDirPath);
    const audioFile = files.find(file => file.startsWith(audioId));

    if (!audioFile) {
      throw new Error(`Audio ${audioId} not found`);
    }

    const audioPath = path.join(this.config.audioDirPath, audioFile);
    return fs.readFileSync(audioPath);
  }

  public getVideo(videoId: string): Buffer {
    const videoPath = this.getVideoPath(videoId);
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video ${videoId} not found`);
    }
    return fs.readFileSync(videoPath);
  }

  private findMusic(videoDuration: number, tag?: MusicMoodEnum): MusicForVideo {
    const musicFiles = this.musicManager.musicList().filter((music) => {
      if (tag) {
        return music.mood === tag;
      }
      return true;
    });
    return musicFiles[Math.floor(Math.random() * musicFiles.length)];
  }

  public ListAvailableMusicTags(): MusicTag[] {
    const tags = new Set<MusicTag>();
    this.musicManager.musicList().forEach((music) => {
      tags.add(music.mood as MusicTag);
    });
    return Array.from(tags.values());
  }

  public listAllVideos(): { id: string; title?: string; status: VideoStatus }[] {
    // Obtener todos los videos de la base de datos
    const dbVideos = this.database.getAllVideos();
    
    // Crear un mapa para actualizar estados de videos en cola
    const videosMap = new Map<string, { id: string; title?: string; status: VideoStatus }>();
    
    // Agregar videos de la DB
    for (const dbVideo of dbVideos) {
      videosMap.set(dbVideo.id, {
        id: dbVideo.id,
        title: dbVideo.title,
        status: dbVideo.status,
      });
    }
    
    // Actualizar estados de videos que están en la cola (processing)
    for (const queueItem of this.queue) {
      const existing = videosMap.get(queueItem.id);
      if (existing) {
        existing.status = "processing";
      } else {
        // Video en cola pero no en DB (no debería pasar, pero por seguridad)
        videosMap.set(queueItem.id, {
          id: queueItem.id,
          title: queueItem.title,
          status: "processing",
        });
      }
    }
    
    // Convertir mapa a array y ordenar por fecha (más recientes primero)
    return Array.from(videosMap.values());
  }

  public listAllImages(): { id: string; filename: string; status: ImageStatus }[] {
    // Obtener todas las imágenes de la base de datos
    const dbImages = this.database.getAllImages();
    
    // Crear un mapa para actualizar estados de imágenes en cola
    const imagesMap = new Map<string, { id: string; filename: string; status: ImageStatus }>();
    
    // Agregar imágenes de la DB
    for (const dbImage of dbImages) {
      imagesMap.set(dbImage.id, {
        id: dbImage.id,
        filename: dbImage.filename,
        status: dbImage.status,
      });
    }
    
    // Actualizar estados de imágenes que están en la cola (processing)
    for (const queueItem of this.queue) {
      if ('imageId' in queueItem.sceneInput[0]) {
        const kenBurstScenes = queueItem.sceneInput as KenBurstSceneInput[];
        for (const scene of kenBurstScenes) {
          const existing = imagesMap.get(scene.imageId);
          if (existing) {
            existing.status = "processing";
          } else {
            // Imagen en cola pero no en DB (no debería pasar, pero por seguridad)
            imagesMap.set(scene.imageId, {
              id: scene.imageId,
              filename: `${scene.imageId} (processing)`,
              status: "processing",
            });
          }
        }
      }
    }
    
    // Convertir mapa a array
    return Array.from(imagesMap.values());
  }

  public ListAvailableVoices(): string[] {
    return this.kokoro.listAvailableVoices();
  }

  public addKenBurstToQueue(
    scenes: KenBurstSceneInput[],
    config: RenderConfig,
    title?: string,
  ): string {
    // todo add mutex lock
    const id = cuid();
    
    // Guardar en la base de datos
    this.database.insertVideo(id, "processing", 0, title);
    
    this.queue.push({
      sceneInput: scenes,
      config: config,
      id,
      title,
    });
    if (this.queue.length === 1) {
      this.processQueue();
    }
    return id;
  }
}
