import ffmpeg from "fluent-ffmpeg";
import { Readable } from "node:stream";
import { logger } from "../../logger";
import ffprobe from "ffprobe-static";

export class FFMpeg {
  static async init(): Promise<FFMpeg> {
    return import("@ffmpeg-installer/ffmpeg").then((ffmpegInstaller) => {
      ffmpeg.setFfmpegPath(ffmpegInstaller.path);
      ffmpeg.setFfprobePath(ffprobe.path);
      logger.info({ path: ffmpegInstaller.path }, "FFmpeg path set");
      return new FFMpeg();
    });
  }

  async saveNormalizedAudio(
    audio: ArrayBuffer,
    outputPath: string,
  ): Promise<string> {
    logger.debug("Normalizing audio for Whisper");
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputStream)
        .audioCodec("pcm_s16le")
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat("wav")
        .on("end", () => {
          logger.debug("Audio normalization complete");
          resolve(outputPath);
        })
        .on("error", (error: unknown) => {
          logger.error(error, "Error normalizing audio:");
          reject(error);
        })
        .save(outputPath);
    });
  }

  async createMp3DataUri(audio: ArrayBuffer): Promise<string> {
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);
    return new Promise((resolve, reject) => {
      const chunk: Buffer[] = [];

      ffmpeg()
        .input(inputStream)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .toFormat("mp3")
        .on("error", (err) => {
          reject(err);
        })
        .pipe()
        .on("data", (data: Buffer) => {
          chunk.push(data);
        })
        .on("end", () => {
          const buffer = Buffer.concat(chunk);
          resolve(`data:audio/mp3;base64,${buffer.toString("base64")}`);
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  async saveToMp3(audio: ArrayBuffer, filePath: string): Promise<string> {
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputStream)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .toFormat("mp3")
        .save(filePath)
        .on("end", () => {
          logger.debug("Audio conversion complete");
          resolve(filePath);
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  async getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          logger.error(err, "Error getting audio duration");
          reject(err);
          return;
        }
        const duration = metadata.format.duration;
        if (duration === undefined) {
          reject(new Error("Could not determine audio duration"));
          return;
        }
        resolve(duration);
      });
    });
  }

  async convertAudioFileToArrayBuffer(
    inputPath: string,
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      ffmpeg()
        .input(inputPath)
        .audioCodec("pcm_s16le")
        .audioChannels(2)
        .audioFrequency(44100)
        .toFormat("wav")
        .on("error", (err) => {
          logger.error(err, "Error converting audio file to ArrayBuffer");
          reject(err);
        })
        .pipe()
        .on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        })
        .on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer.buffer);
        })
        .on("error", (err) => {
          logger.error(err, "Error in audio conversion stream");
          reject(err);
        });
    });
  }

  async normalizeAudioFile(
    inputPath: string,
    outputPath: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .audioCodec("pcm_s16le")
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat("wav")
        .on("end", () => {
          logger.debug("Audio file normalization complete");
          resolve(outputPath);
        })
        .on("error", (error: unknown) => {
          logger.error(error, "Error normalizing audio file");
          reject(error);
        })
        .save(outputPath);
    });
  }

  async convertAudioFileToMp3(
    inputPath: string,
    outputPath: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .toFormat("mp3")
        .save(outputPath)
        .on("end", () => {
          logger.debug("Audio file conversion to MP3 complete");
          resolve(outputPath);
        })
        .on("error", (err) => {
          logger.error(err, "Error converting audio file to MP3");
          reject(err);
        });
    });
  }

  async splitAudioFile(
    inputPath: string,
    startSeconds: number,
    durationSeconds: number,
    outputPath: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .seekInput(startSeconds)
        .duration(durationSeconds)
        .toFormat("mp3")
        .save(outputPath)
        .on("end", () => {
          logger.debug(`Audio segment extracted: ${startSeconds}s to ${startSeconds + durationSeconds}s`);
          resolve(outputPath);
        })
        .on("error", (err) => {
          logger.error(err, "Error splitting audio file");
          reject(err);
        });
    });
  }

  async splitAudioForWhisper(
    inputPath: string,
    startSeconds: number,
    durationSeconds: number,
    outputPath: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .audioCodec("pcm_s16le")
        .audioChannels(1)
        .audioFrequency(16000)
        .seekInput(startSeconds)
        .duration(durationSeconds)
        .toFormat("wav")
        .save(outputPath)
        .on("end", () => {
          logger.debug(`Audio segment for Whisper extracted: ${startSeconds}s to ${startSeconds + durationSeconds}s`);
          resolve(outputPath);
        })
        .on("error", (err) => {
          logger.error(err, "Error splitting audio for Whisper");
          reject(err);
        });
    });
  }
}
