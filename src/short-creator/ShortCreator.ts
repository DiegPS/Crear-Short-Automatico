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
  ) {}

  public status(id: string): VideoStatus | { status: VideoStatus; progress?: number } {
    const videoPath = this.getVideoPath(id);
    const isInQueue = this.queue.find((item) => item.id === id);
    const progress = this.progressMap.get(id);
    
    if (isInQueue) {
      return { status: "processing", progress };
    }
    if (fs.existsSync(videoPath)) {
      // Clean up progress when video is ready
      this.progressMap.delete(id);
      return "ready";
    }
    // Clean up progress when video failed
    this.progressMap.delete(id);
    return "failed";
  }

  public addToQueue(sceneInput: SceneInput[], config: RenderConfig): string {
    // todo add mutex lock
    const id = cuid();
    this.queue.push({
      sceneInput,
      config,
      id,
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
    } catch (error: unknown) {
      logger.error(error, "Error creating video");
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
      const audio = await this.kokoro.generate(
        scene.text,
        config.voice ?? "af_heart",
      );
      let { audioLength } = audio;
      const { audio: audioStream } = audio;

      // add the paddingBack in seconds to the last scene
      if (index + 1 === inputScenes.length && config.paddingBack) {
        audioLength += config.paddingBack / 1000;
      }

      const tempId = cuid();
      const tempWavFileName = `${tempId}.wav`;
      const tempMp3FileName = `${tempId}.mp3`;
      const tempWavPath = path.join(this.config.tempDirPath, tempWavFileName);
      const tempMp3Path = path.join(this.config.tempDirPath, tempMp3FileName);
      tempFiles.push(tempWavPath, tempMp3Path);

      await this.ffmpeg.saveNormalizedAudio(audioStream, tempWavPath);
      const captions = await this.whisper.CreateCaption(tempWavPath);

      await this.ffmpeg.saveToMp3(audioStream, tempMp3Path);

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
        // Update progress in the map
        this.progressMap.set(videoId, Math.floor(progress * 100));
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
    fs.removeSync(videoPath);
    logger.debug({ videoId }, "Deleted video file");
  }

  public deleteImage(imageId: string): void {
    const files = fs.readdirSync(this.config.imagesDirPath);
    const imageFile = files.find(file => file.startsWith(imageId));
    
    if (!imageFile) {
      throw new Error(`Image ${imageId} not found`);
    }

    const imagePath = path.join(this.config.imagesDirPath, imageFile);
    fs.removeSync(imagePath);
    logger.debug({ imageId }, "Deleted image file");
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

  public listAllVideos(): { id: string; status: VideoStatus }[] {
    const videos: { id: string; status: VideoStatus }[] = [];

    // Check if videos directory exists
    if (!fs.existsSync(this.config.videosDirPath)) {
      return videos;
    }

    // Read all files in the videos directory
    const files = fs.readdirSync(this.config.videosDirPath);

    // Filter for MP4 files and extract video IDs
    for (const file of files) {
      if (file.endsWith(".mp4")) {
        const videoId = file.replace(".mp4", "");

        let status: VideoStatus = "ready";
        const inQueue = this.queue.find((item) => item.id === videoId);
        if (inQueue) {
          status = "processing";
        }

        videos.push({ id: videoId, status });
      }
    }

    // Add videos that are in the queue but not yet rendered
    for (const queueItem of this.queue) {
      const existingVideo = videos.find((v) => v.id === queueItem.id);
      if (!existingVideo) {
        videos.push({ id: queueItem.id, status: "processing" });
      }
    }

    return videos;
  }

  public listAllImages(): { id: string; filename: string; status: ImageStatus }[] {
    const images: { id: string; filename: string; status: ImageStatus }[] = [];

    // Check if images directory exists
    if (!fs.existsSync(this.config.imagesDirPath)) {
      return images;
    }

    // Read all files in the images directory
    const files = fs.readdirSync(this.config.imagesDirPath);

    // Process each image file
    for (const file of files) {
      const id = path.parse(file).name;
      let status: ImageStatus = "ready";

      // Check if image is being used in any processing ken burst video
      const isInQueue = this.queue.some(item => {
        if ('imageId' in item.sceneInput[0]) {
          return (item.sceneInput as KenBurstSceneInput[]).some(
            scene => scene.imageId === id
          );
        }
        return false;
      });

      if (isInQueue) {
        status = "processing";
      }

      images.push({ id, filename: file, status });
    }

    // Add images that are in the queue but not yet rendered
    for (const queueItem of this.queue) {
      if ('imageId' in queueItem.sceneInput[0]) {
        const kenBurstScenes = queueItem.sceneInput as KenBurstSceneInput[];
        for (const scene of kenBurstScenes) {
          const existingImage = images.find(img => img.id === scene.imageId);
          if (!existingImage) {
            // If image is not found in the directory but is in queue, add it with processing status
            images.push({
              id: scene.imageId,
              filename: `${scene.imageId} (processing)`,
              status: "processing"
            });
          }
        }
      }
    }

    return images;
  }

  public ListAvailableVoices(): string[] {
    return this.kokoro.listAvailableVoices();
  }

  public addKenBurstToQueue(
    scenes: KenBurstSceneInput[],
    config: RenderConfig,
  ): string {
    // todo add mutex lock
    const id = cuid();
    this.queue.push({
      sceneInput: scenes,
      config: config,
      id,
    });
    if (this.queue.length === 1) {
      this.processQueue();
    }
    return id;
  }
}
