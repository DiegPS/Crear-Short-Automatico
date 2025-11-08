import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import {
  VoiceEnum,
  type kokoroModelPrecision,
  type Voices,
} from "../../types/shorts";
import { KOKORO_MODEL, logger, Config } from "../../config";
import { execFile, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs-extra";
import { randomUUID } from "crypto";
import { Readable, Writable } from "stream";

const execFileAsync = promisify(execFile);

export class Kokoro {
  private pythonServer: ChildProcess | null = null;
  private pythonServerReady: boolean = false;
  private pythonServerPath: string | null = null;
  private pythonPath: string | null = null;
  
  constructor(
    private tts: KokoroTTS,
    private config: Config,
  ) {}

  /**
   * Mapea códigos de idioma ISO 639-1 a códigos de idioma de Kokoro Python
   * 'a' = American English, 'b' = British English, 'e' = Spanish es
   * 'f' = French, 'h' = Hindi, 'i' = Italian, 'j' = Japanese
   * 'p' = Brazilian Portuguese, 'z' = Mandarin Chinese
   */
  private getKokoroLangCode(language: string | null | undefined): string {
    if (!language) return "a"; // Default to American English
    
    const langMap: Record<string, string> = {
      en: "a", // American English
      "en-GB": "b", // British English
      "en-US": "a", // American English
      es: "e", // Spanish
      fr: "f", // French
      hi: "h", // Hindi
      it: "i", // Italian
      ja: "j", // Japanese
      pt: "p", // Portuguese (Brazilian)
      "pt-BR": "p", // Portuguese (Brazilian)
      zh: "z", // Mandarin Chinese
    };
    
    return langMap[language.toLowerCase()] || "a";
  }

  /**
   * Valida y mapea la voz según el idioma.
   * Para español, solo están disponibles: ef_dora, em_alex, em_santa
   * Si se usa una voz no válida para español, se mapea a ef_dora por defecto
   */
  private getValidVoiceForLanguage(
    voice: Voices,
    language: string | null | undefined,
  ): Voices {
    // Voces válidas para español
    const spanishVoices: Voices[] = ["ef_dora", "em_alex", "em_santa"];
    
    // Si el idioma es español
    if (language === "es") {
      // Si la voz ya es una voz en español, usarla
      if (spanishVoices.includes(voice)) {
        return voice;
      }
      // Si no, mapear a una voz en español por defecto
      // Intentar mapear basado en el género de la voz original
      if (voice.startsWith("af_") || voice.startsWith("bf_")) {
        // Voz femenina -> usar ef_dora
        logger.warn(
          { originalVoice: voice, language },
          "Voice not available for Spanish, mapping to ef_dora",
        );
        return "ef_dora";
      } else if (voice.startsWith("am_") || voice.startsWith("bm_")) {
        // Voz masculina -> usar em_alex
        logger.warn(
          { originalVoice: voice, language },
          "Voice not available for Spanish, mapping to em_alex",
        );
        return "em_alex";
      } else {
        // Por defecto, usar ef_dora
        logger.warn(
          { originalVoice: voice, language },
          "Voice not available for Spanish, mapping to ef_dora",
        );
        return "ef_dora";
      }
    }
    
    // Para otros idiomas, usar la voz tal cual
    return voice;
  }

  /**
   * Inicia el servidor Python persistente si no está corriendo
   */
  private async ensurePythonServer(): Promise<void> {
    if (this.pythonServer && this.pythonServerReady) {
      return;
    }

    // Buscar el script del servidor
    const possibleServerPaths = [
      path.join(__dirname, "kokoro_python_server.py"),
      path.join(__dirname, "../../../src/short-creator/libraries/kokoro_python_server.py"),
      path.join(this.config.packageDirPath, "src/short-creator/libraries/kokoro_python_server.py"),
      path.join(this.config.packageDirPath, "dist/short-creator/libraries/kokoro_python_server.py"),
    ];

    let serverPath: string | null = null;
    for (const possiblePath of possibleServerPaths) {
      if (await fs.pathExists(possiblePath)) {
        serverPath = possiblePath;
        break;
      }
    }

    if (!serverPath) {
      logger.warn("Python server script not found, falling back to one-time execution");
      return;
    }

    // Buscar python3
    const pythonPaths = [
      "python3",
      path.join(this.config.packageDirPath, "venv/bin/python3"),
      "python",
    ];

    let pythonPath: string | null = null;
    for (const possiblePath of pythonPaths) {
      try {
        await execFileAsync(possiblePath, ["--version"]);
        pythonPath = possiblePath;
        break;
      } catch {
        // Continuar buscando
      }
    }

    if (!pythonPath) {
      logger.warn("Python3 not found, falling back to one-time execution");
      return;
    }

    this.pythonPath = pythonPath;
    this.pythonServerPath = serverPath;

    // Iniciar el servidor
    this.pythonServer = spawn(pythonPath, [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.pythonServer.stderr?.on("data", (data) => {
      const message = data.toString();
      // Solo loguear errores reales, no warnings
      if (!/(UserWarning|FutureWarning|Warning:)/i.test(message)) {
        logger.warn({ stderr: message }, "Python server stderr");
      }
    });

    this.pythonServer.on("error", (error) => {
      logger.error({ error }, "Python server error");
      this.pythonServer = null;
      this.pythonServerReady = false;
    });

    this.pythonServer.on("exit", (code) => {
      logger.warn({ code }, "Python server exited");
      this.pythonServer = null;
      this.pythonServerReady = false;
    });

    // Verificar que el servidor esté listo
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Python server startup timeout"));
      }, 30000); // 30 segundos para cargar el modelo

      const onData = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.success && response.message === "pong") {
            clearTimeout(timeout);
            this.pythonServer?.stdout?.removeListener("data", onData);
            this.pythonServerReady = true;
            logger.debug("Python server ready");
            resolve();
          }
        } catch {
          // Ignorar líneas que no son JSON
        }
      };

      this.pythonServer?.stdout?.on("data", onData);

      // Enviar ping
      const pingCommand = JSON.stringify({ action: "ping" }) + "\n";
      this.pythonServer?.stdin?.write(pingCommand);
    });
  }

  /**
   * Genera audio usando el servidor Python persistente
   */
  private async generateWithPythonServer(
    text: string,
    voice: Voices,
    langCode: string,
    outputPath: string,
  ): Promise<{ duration: number }> {
    const server = this.pythonServer;
    if (!server || !this.pythonServerReady) {
      throw new Error("Python server not ready");
    }

    const stdout = server.stdout;
    const stdin = server.stdin;
    
    if (!stdout || !stdin) {
      throw new Error("Python server streams not available");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Python server request timeout"));
      }, 60000); // 60 segundos timeout

      const onData = (data: Buffer) => {
        try {
          const lines = data.toString().split("\n").filter((l) => l.trim());
          for (const line of lines) {
            try {
              const response = JSON.parse(line);
              if (response.success !== undefined) {
                clearTimeout(timeout);
                stdout.removeListener("data", onData);
                if (response.success) {
                  resolve({ duration: response.duration });
                } else {
                  reject(new Error(response.error || "Python server error"));
                }
                return;
              }
            } catch {
              // Ignorar líneas que no son JSON
            }
          }
        } catch (error) {
          clearTimeout(timeout);
          stdout.removeListener("data", onData);
          reject(error);
        }
      };

      stdout.on("data", onData);

      const command = JSON.stringify({
        action: "generate",
        text,
        voice,
        lang_code: langCode,
        output_path: outputPath,
      }) + "\n";

      stdin.write(command, (error) => {
        if (error) {
          clearTimeout(timeout);
          stdout.removeListener("data", onData);
          reject(error);
        }
      });
    });
  }

  /**
   * Genera audio usando Kokoro Python (soporta español y otros idiomas)
   */
  private async generateWithPython(
    text: string,
    voice: Voices,
    language: string | null | undefined,
  ): Promise<{
    audio: ArrayBuffer;
    audioLength: number;
  }> {
    const startTime = Date.now();
    const langCode = this.getKokoroLangCode(language);
    // Validar y mapear la voz según el idioma
    const validVoice = this.getValidVoiceForLanguage(voice, language);
    
    const outputPath = path.join(
      this.config.tempDirPath,
      `kokoro_${randomUUID()}.wav`,
    );

    try {
      // Intentar usar el servidor persistente primero
      await this.ensurePythonServer();
      
      if (this.pythonServer && this.pythonServerReady) {
        // Usar servidor persistente (mucho más rápido)
        const pythonStartTime = Date.now();
        const result = await this.generateWithPythonServer(
          text,
          validVoice,
          langCode,
          outputPath,
        );
        const pythonTime = Date.now() - pythonStartTime;
        logger.debug({ pythonTime: `${pythonTime}ms` }, "Python server execution time");
        
        // Leer el archivo WAV generado
        const audioBuffer = await fs.readFile(outputPath);
        const audioArrayBuffer = audioBuffer.buffer.slice(
          audioBuffer.byteOffset,
          audioBuffer.byteOffset + audioBuffer.byteLength,
        );

        // Limpiar el archivo temporal
        await fs.remove(outputPath);

        const totalTime = Date.now() - startTime;
        logger.debug(
          { 
            text, 
            voice: validVoice, 
            originalVoice: voice, 
            language, 
            langCode, 
            audioLength: result.duration,
            totalTime: `${totalTime}ms`,
            pythonTime: `${pythonTime}ms`
          },
          "Audio generated with Kokoro Python (persistent server)",
        );

        return {
          audio: audioArrayBuffer,
          audioLength: result.duration,
        };
      }
      
      // Fallback: usar script one-time (más lento pero funciona)
      logger.debug("Using one-time Python script (server not available)");
      
      // Buscar el script en múltiples ubicaciones posibles
      const possiblePaths = [
        path.join(__dirname, "kokoro_python_helper.py"),
        path.join(__dirname, "../../../src/short-creator/libraries/kokoro_python_helper.py"),
        path.join(this.config.packageDirPath, "src/short-creator/libraries/kokoro_python_helper.py"),
        path.join(this.config.packageDirPath, "dist/short-creator/libraries/kokoro_python_helper.py"),
      ];
      
      let scriptPath: string | null = null;
      for (const possiblePath of possiblePaths) {
        if (await fs.pathExists(possiblePath)) {
          scriptPath = possiblePath;
          break;
        }
      }
      
      if (!scriptPath) {
        throw new Error(
          `Kokoro Python helper script not found. Searched in: ${possiblePaths.join(", ")}`,
        );
      }

      // Buscar python3
      const pythonPaths = [
        "python3",
        path.join(this.config.packageDirPath, "venv/bin/python3"),
        "python",
      ];
      
      let pythonPath: string | null = null;
      for (const possiblePath of pythonPaths) {
        try {
          await execFileAsync(possiblePath, ["--version"]);
          pythonPath = possiblePath;
          break;
        } catch {
          // Continuar buscando
        }
      }
      
      if (!pythonPath) {
        throw new Error("Python3 not found. Please install Python 3.");
      }

      // Ejecutar el script Python con la voz validada
      const pythonStartTime = Date.now();
      const { stdout, stderr } = await execFileAsync(pythonPath, [
        scriptPath,
        text,
        validVoice,
        langCode,
        outputPath,
      ]);
      const pythonTime = Date.now() - pythonStartTime;
      logger.debug({ pythonTime: `${pythonTime}ms` }, "Python script execution time");

      // Los warnings de PyTorch van a stderr, pero no son errores críticos
      // Solo loguear si hay contenido en stderr que no sean warnings comunes
      if (stderr && stderr.trim().length > 0) {
        const isJustWarnings = /(UserWarning|FutureWarning|Warning:)/i.test(stderr);
        if (!isJustWarnings) {
          logger.warn({ stderr }, "Kokoro Python stderr output");
        }
      }

      // Parsear la respuesta JSON desde stdout
      // Limpiar stdout para asegurar que solo contenga JSON
      const stdoutClean = stdout.trim();
      let jsonString = stdoutClean;
      
      // Si stdout no empieza con JSON, puede haber warnings mezclados
      // Buscar la última línea que sea JSON válido
      if (!stdoutClean.startsWith('{') && !stdoutClean.startsWith('[')) {
        const lines = stdoutClean.split('\n');
        let jsonLine = '';
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{') || line.startsWith('[')) {
            jsonLine = line;
            break;
          }
        }
        if (!jsonLine) {
          throw new Error(`No valid JSON found in stdout. Output: ${stdoutClean.substring(0, 200)}`);
        }
        jsonString = jsonLine;
      }
      
      const result = JSON.parse(jsonString);
      
      if (!result.success) {
        throw new Error(result.error || "Failed to generate audio with Kokoro Python");
      }

      // Leer el archivo WAV generado
      const audioBuffer = await fs.readFile(outputPath);
      const audioArrayBuffer = audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength,
      );

      // Limpiar el archivo temporal
      await fs.remove(outputPath);

      const totalTime = Date.now() - startTime;
      logger.debug(
        { 
          text, 
          voice: validVoice, 
          originalVoice: voice, 
          language, 
          langCode, 
          audioLength: result.duration,
          totalTime: `${totalTime}ms`,
          pythonTime: `${pythonTime}ms`
        },
        "Audio generated with Kokoro Python",
      );

      return {
        audio: audioArrayBuffer,
        audioLength: result.duration,
      };
    } catch (error) {
      // Limpiar el archivo temporal en caso de error
      if (await fs.pathExists(outputPath)) {
        await fs.remove(outputPath).catch(() => {});
      }
      throw error;
    }
  }

  async generate(
    text: string,
    voice: Voices,
    language?: string | null,
  ): Promise<{
    audio: ArrayBuffer;
    audioLength: number;
  }> {
    // Si el idioma es español u otro idioma no soportado por kokoro-js, usar Python
    const usePython = language === "es" || (language && language !== "en");
    
    if (usePython) {
      return this.generateWithPython(text, voice, language);
    }

    // Usar kokoro-js para inglés (comportamiento original)
    // kokoro-js solo acepta voces en inglés, no voces en español
    const spanishVoices: Voices[] = ["ef_dora", "em_alex", "em_santa"];
    let voiceToUse: Voices = voice;
    
    // Si la voz es una voz en español, mapearla a una voz en inglés por defecto
    if (spanishVoices.includes(voice)) {
      // Si es una voz en español pero estamos usando inglés, mapear a af_heart
      logger.warn(
        { originalVoice: voice, language },
        "Spanish voice used for English, mapping to af_heart",
      );
      voiceToUse = "af_heart";
    }
    
    // Asegurar que voiceToUse es una voz válida para kokoro-js (solo inglés)
    // Hacer un cast porque TypeScript no sabe que ya filtramos las voces en español
    const englishVoice = spanishVoices.includes(voiceToUse) ? "af_heart" : voiceToUse;
    
    const splitter = new TextSplitterStream();
    const stream = this.tts.stream(splitter, {
      voice: englishVoice as Exclude<Voices, "ef_dora" | "em_alex" | "em_santa">,
    });
    splitter.push(text);
    splitter.close();

    const output = [];
    for await (const audio of stream) {
      output.push(audio);
    }

    const audioBuffers: ArrayBuffer[] = [];
    let audioLength = 0;
    for (const audio of output) {
      audioBuffers.push(audio.audio.toWav());
      audioLength += audio.audio.audio.length / audio.audio.sampling_rate;
    }

    const mergedAudioBuffer = Kokoro.concatWavBuffers(audioBuffers);
    logger.debug({ text, voice, audioLength }, "Audio generated with Kokoro JS");

    return {
      audio: mergedAudioBuffer,
      audioLength: audioLength,
    };
  }

  static concatWavBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
    const header = Buffer.from(buffers[0].slice(0, 44));
    let totalDataLength = 0;

    const dataParts = buffers.map((buf) => {
      const b = Buffer.from(buf);
      const data = b.slice(44);
      totalDataLength += data.length;
      return data;
    });

    header.writeUInt32LE(36 + totalDataLength, 4);
    header.writeUInt32LE(totalDataLength, 40);

    return Buffer.concat([header, ...dataParts]);
  }

  static async init(
    dtype: kokoroModelPrecision,
    config: Config,
  ): Promise<Kokoro> {
    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
      dtype,
      device: "cpu", // only "cpu" is supported in node
    });

    const kokoro = new Kokoro(tts, config);
    
    // Intentar iniciar el servidor Python al inicio (opcional, fallback a one-time si falla)
    logger.debug("initializing python server for Kokoro");
    try {
      await kokoro.ensurePythonServer();
      if (kokoro.pythonServer && kokoro.pythonServerReady) {
        logger.debug("Python server initialized successfully");
      } else {
        logger.debug("Python server not available, will use one-time execution");
      }
    } catch (error) {
      logger.warn({ error }, "Failed to initialize Python server, will use one-time execution");
    }
    
    return kokoro;
  }

  listAvailableVoices(): Voices[] {
    const voices = Object.values(VoiceEnum) as Voices[];
    return voices;
  }
}
