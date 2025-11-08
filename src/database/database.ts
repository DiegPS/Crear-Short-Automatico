import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs-extra";
import path from "path";
import { Config } from "../config";
import { logger } from "../config";
import { VideoStatus } from "../types/shorts";

export type ImageStatus = "ready" | "processing";

export class DatabaseManager {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private SQL: any; // sql.js instance

  constructor(config: Config) {
    // Crear el directorio de base de datos si no existe
    const dbDir = path.join(config.dataDirPath, "database");
    fs.ensureDirSync(dbDir);
    
    // Ruta del archivo de base de datos
    this.dbPath = path.join(dbDir, "app.db");
    
    // Inicializar SQL.js de forma asíncrona
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // Inicializar SQL.js
      this.SQL = await initSqlJs({
        locateFile: (file: string) => {
          // sql.js necesita encontrar el archivo .wasm
          // En producción, necesitarás copiar node_modules/sql.js/dist/sql-wasm.wasm a un lugar accesible
          // Por ahora, intentamos desde node_modules
          const wasmPath = path.join(
            __dirname,
            "../../node_modules/sql.js/dist/sql-wasm.wasm"
          );
          if (fs.existsSync(wasmPath)) {
            return wasmPath;
          }
          // Fallback: buscar en diferentes ubicaciones
          return require.resolve("sql.js/dist/sql-wasm.wasm");
        },
      });

      // Cargar base de datos existente o crear nueva
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(buffer);
        const fileSize = fs.statSync(this.dbPath).size;
        logger.info(
          { dbPath: this.dbPath, size: `${(fileSize / 1024).toFixed(2)} KB` },
          "Base de datos SQLite cargada"
        );
      } else {
        this.db = new this.SQL.Database();
        logger.info({ dbPath: this.dbPath }, "Base de datos SQLite creada (nueva)");
      }

      // Crear las tablas
      this.initializeTables();
    } catch (error) {
      logger.error({ error, dbPath: this.dbPath }, "Error inicializando base de datos");
      throw error;
    }
  }

  private ensureDatabase(): void {
    if (!this.db) {
      throw new Error("Base de datos no inicializada. Espera a que se inicialice.");
    }
  }

  private initializeTables(): void {
    this.ensureDatabase();

    // Tabla de videos
    this.db!.run(`
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK(status IN ('processing', 'ready', 'failed')),
        progress INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de imágenes
    this.db!.run(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('ready', 'processing')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de audios
    this.db!.run(`
      CREATE TABLE IF NOT EXISTS audios (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('ready', 'processing')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear índices
    this.db!.run(`CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status)`);
    this.db!.run(`CREATE INDEX IF NOT EXISTS idx_images_status ON images(status)`);
    this.db!.run(`CREATE INDEX IF NOT EXISTS idx_audios_status ON audios(status)`);
    this.db!.run(`CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at)`);
    this.db!.run(`CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at)`);
    this.db!.run(`CREATE INDEX IF NOT EXISTS idx_audios_created_at ON audios(created_at)`);

    // Guardar cambios
    this.save();

    // Verificar que las tablas se crearon correctamente
    const tablesStmt = this.db!.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tables: string[] = [];
    while (tablesStmt.step()) {
      const row = tablesStmt.getAsObject() as { name: string };
      tables.push(row.name);
    }
    tablesStmt.free();

    logger.info(
      { tables, dbPath: this.dbPath },
      "Tablas de base de datos inicializadas correctamente"
    );
  }

  private save(): void {
    this.ensureDatabase();
    const data = this.db!.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  // Métodos para videos
  public insertVideo(id: string, status: VideoStatus = "processing", progress: number = 0): void {
    this.ensureDatabase();
    const stmt = this.db!.prepare(`
      INSERT INTO videos (id, status, progress, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `);
    stmt.run([id, status, progress]);
    stmt.free();
    this.save();
  }

  public updateVideoStatus(id: string, status: VideoStatus, progress?: number): void {
    this.ensureDatabase();
    if (progress !== undefined) {
      const stmt = this.db!.prepare(`
        UPDATE videos 
        SET status = ?, progress = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run([status, progress, id]);
      stmt.free();
    } else {
      const stmt = this.db!.prepare(`
        UPDATE videos 
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run([status, id]);
      stmt.free();
    }
    this.save();
  }

  public getVideo(id: string): { id: string; status: VideoStatus; progress: number } | null {
    this.ensureDatabase();
    const stmt = this.db!.prepare("SELECT id, status, progress FROM videos WHERE id = ?");
    stmt.bind([id]);
    
    if (stmt.step()) {
      const result = stmt.getAsObject() as { id: string; status: VideoStatus; progress: number };
      stmt.free();
      return {
        id: result.id,
        status: result.status,
        progress: result.progress || 0,
      };
    }
    
    stmt.free();
    return null;
  }

  public getAllVideos(): { id: string; status: VideoStatus }[] {
    this.ensureDatabase();
    const stmt = this.db!.prepare("SELECT id, status FROM videos ORDER BY created_at DESC");
    const results: { id: string; status: VideoStatus }[] = [];
    
    while (stmt.step()) {
      const row = stmt.getAsObject() as { id: string; status: VideoStatus };
      results.push({ id: row.id, status: row.status });
    }
    
    stmt.free();
    return results;
  }

  public deleteVideo(id: string): void {
    this.ensureDatabase();
    const stmt = this.db!.prepare("DELETE FROM videos WHERE id = ?");
    stmt.run([id]);
    stmt.free();
    this.save();
  }

  // Métodos para imágenes
  public insertImage(id: string, filename: string, status: ImageStatus = "ready"): void {
    this.ensureDatabase();
    const stmt = this.db!.prepare(`
      INSERT INTO images (id, filename, status, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `);
    stmt.run([id, filename, status]);
    stmt.free();
    this.save();
  }

  public updateImageStatus(id: string, status: ImageStatus): void {
    this.ensureDatabase();
    const stmt = this.db!.prepare(`
      UPDATE images 
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run([status, id]);
    stmt.free();
    this.save();
  }

  public getImage(id: string): { id: string; filename: string; status: ImageStatus } | null {
    this.ensureDatabase();
    const stmt = this.db!.prepare("SELECT id, filename, status FROM images WHERE id = ?");
    stmt.bind([id]);
    
    if (stmt.step()) {
      const result = stmt.getAsObject() as { id: string; filename: string; status: ImageStatus };
      stmt.free();
      return {
        id: result.id,
        filename: result.filename,
        status: result.status,
      };
    }
    
    stmt.free();
    return null;
  }

  public getAllImages(): { id: string; filename: string; status: ImageStatus }[] {
    this.ensureDatabase();
    const stmt = this.db!.prepare("SELECT id, filename, status FROM images ORDER BY created_at DESC");
    const results: { id: string; filename: string; status: ImageStatus }[] = [];
    
    while (stmt.step()) {
      const row = stmt.getAsObject() as { id: string; filename: string; status: ImageStatus };
      results.push({ id: row.id, filename: row.filename, status: row.status });
    }
    
    stmt.free();
    return results;
  }

  public deleteImage(id: string): void {
    this.ensureDatabase();
    const stmt = this.db!.prepare("DELETE FROM images WHERE id = ?");
    stmt.run([id]);
    stmt.free();
    this.save();
  }

  // Métodos para audios
  public insertAudio(id: string, filename: string, status: ImageStatus = "ready"): void {
    this.ensureDatabase();
    const stmt = this.db!.prepare(`
      INSERT INTO audios (id, filename, status, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `);
    stmt.run([id, filename, status]);
    stmt.free();
    this.save();
  }

  public updateAudioStatus(id: string, status: ImageStatus): void {
    this.ensureDatabase();
    const stmt = this.db!.prepare(`
      UPDATE audios 
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run([status, id]);
    stmt.free();
    this.save();
  }

  public getAudio(id: string): { id: string; filename: string; status: ImageStatus } | null {
    this.ensureDatabase();
    const stmt = this.db!.prepare("SELECT id, filename, status FROM audios WHERE id = ?");
    stmt.bind([id]);
    
    if (stmt.step()) {
      const result = stmt.getAsObject() as { id: string; filename: string; status: ImageStatus };
      stmt.free();
      return {
        id: result.id,
        filename: result.filename,
        status: result.status,
      };
    }
    
    stmt.free();
    return null;
  }

  public getAllAudios(): { id: string; filename: string; status: ImageStatus }[] {
    this.ensureDatabase();
    const stmt = this.db!.prepare("SELECT id, filename, status FROM audios ORDER BY created_at DESC");
    const results: { id: string; filename: string; status: ImageStatus }[] = [];
    
    while (stmt.step()) {
      const row = stmt.getAsObject() as { id: string; filename: string; status: ImageStatus };
      results.push({ id: row.id, filename: row.filename, status: row.status });
    }
    
    stmt.free();
    return results;
  }

  public deleteAudio(id: string): void {
    this.ensureDatabase();
    const stmt = this.db!.prepare("DELETE FROM audios WHERE id = ?");
    stmt.run([id]);
    stmt.free();
    this.save();
  }

  // Cerrar la conexión
  public close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
      logger.info("Conexión a la base de datos cerrada");
    }
  }

  // Esperar a que la base de datos esté lista (para inicialización asíncrona)
  public async ready(): Promise<void> {
    while (!this.db) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

