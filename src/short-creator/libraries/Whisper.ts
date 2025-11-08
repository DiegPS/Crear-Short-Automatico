import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
} from "@remotion/install-whisper-cpp";
import path from "path";

import { Config } from "../../config";
import type { Caption } from "../../types/shorts";
import { logger } from "../../logger";

export const ErrorWhisper = new Error("There was an error with WhisperCpp");

export class Whisper {
  constructor(private config: Config) {}

  /**
   * Determina qué modelo de Whisper usar basado en el idioma especificado.
   * Si el idioma es "en", usa la versión .en del modelo (más precisa para inglés).
   * Si el idioma es otro o no se especifica, usa la versión multilingüe.
   */
  private getModelForLanguage(language: string | null | undefined): string {
    const baseModel = this.config.whisperModel;
    
    // Si el idioma es inglés, intentar usar la versión .en del modelo
    if (language === "en") {
      // Si el modelo base ya tiene .en, usarlo directamente
      if (baseModel.endsWith(".en")) {
        return baseModel;
      }
      // Si el modelo base es multilingüe, intentar usar la versión .en
      // Mapear modelos comunes a sus versiones .en
      const modelMap: Record<string, string> = {
        "tiny": "tiny.en",
        "base": "base.en",
        "small": "small.en",
        "medium": "medium.en",
        // Los modelos large no tienen versión .en, usar el original
      };
      
      if (modelMap[baseModel]) {
        return modelMap[baseModel];
      }
      // Si no hay versión .en disponible, usar el modelo original
      return baseModel;
    }
    
    // Para idiomas que no son inglés, usar la versión multilingüe
    // Si el modelo tiene .en, removerlo para usar la versión multilingüe
    if (baseModel.endsWith(".en")) {
      return baseModel.slice(0, -3); // Remover ".en"
    }
    
    // Si ya es multilingüe, usarlo directamente
    return baseModel;
  }

  static async init(config: Config): Promise<Whisper> {
    if (!config.runningInDocker) {
      logger.debug("Installing WhisperCpp");
      await installWhisperCpp({
        to: config.whisperInstallPath,
        version: config.whisperVersion,
        printOutput: true,
      });
      logger.debug("WhisperCpp installed");
      logger.debug("Downloading Whisper model");
      await downloadWhisperModel({
        model: config.whisperModel,
        folder: path.join(config.whisperInstallPath, "models"),
        printOutput: config.whisperVerbose,
        onProgress: (downloadedBytes, totalBytes) => {
          const progress = `${Math.round((downloadedBytes / totalBytes) * 100)}%`;
          logger.debug(
            { progress, model: config.whisperModel },
            "Downloading Whisper model",
          );
        },
      });
      // todo run the jfk command to check if everything is ok
      logger.debug("Whisper model downloaded");
    }

    return new Whisper(config);
  }

  // todo shall we extract it to a Caption class?
  async CreateCaption(audioPath: string, language?: string | null): Promise<Caption[]> {
    // Usar el idioma pasado como parámetro, o el de la configuración global, o null (auto-detect)
    const targetLanguage = language ?? this.config.whisperLanguage;
    // Seleccionar el modelo apropiado basado en el idioma
    const modelToUse = this.getModelForLanguage(targetLanguage);
    logger.debug({ audioPath, language: targetLanguage, model: modelToUse }, "Starting to transcribe audio");
    
    // Construir las opciones base
    const transcribeOptions: any = {
      model: modelToUse,
      whisperPath: this.config.whisperInstallPath,
      modelFolder: path.join(this.config.whisperInstallPath, "models"),
      whisperCppVersion: this.config.whisperVersion,
      inputPath: audioPath,
      tokenLevelTimestamps: true,
      printOutput: this.config.whisperVerbose,
      onProgress: (progress: number) => {
        logger.debug({ audioPath }, `Transcribing is ${progress} complete`);
      },
    };
    
    // Agregar language si está especificado (null = auto-detect)
    // Nota: La librería puede no soportar task directamente, pero el modelo .en ya indica que es solo inglés
    // y el modelo multilingüe sin .en transcribe sin traducir por defecto
    if (targetLanguage) {
      transcribeOptions.language = targetLanguage as any;
    }
    
    const { transcription } = await transcribe(transcribeOptions);
    logger.debug({ audioPath }, "Transcription finished, creating captions");

    const captions: Caption[] = [];
    transcription.forEach((record) => {
      if (record.text === "") {
        return;
      }

      record.tokens.forEach((token) => {
        if (token.text.startsWith("[_TT")) {
          return;
        }
        // if token starts without space and the previous node didn't have space either, merge them
        if (
          captions.length > 0 &&
          !token.text.startsWith(" ") &&
          !captions[captions.length - 1].text.endsWith(" ")
        ) {
          captions[captions.length - 1].text += record.text;
          captions[captions.length - 1].endMs = record.offsets.to;
          return;
        }
        captions.push({
          text: token.text,
          startMs: record.offsets.from,
          endMs: record.offsets.to,
        });
      });
    });
    logger.debug({ audioPath, captions }, "Captions created");
    return captions;
  }
}
