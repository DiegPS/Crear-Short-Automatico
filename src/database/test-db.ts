import { Config } from "../config";
import { DatabaseManager } from "./database";

// Script simple para probar la base de datos
const testDatabase = async () => {
  console.log("=== Iniciando prueba de base de datos SQLite (sql.js) ===\n");

  try {
    // Crear instancia de configuración
    const config = new Config();
    
    // Crear instancia de base de datos
    console.log("1. Inicializando base de datos...");
    const db = new DatabaseManager(config);
    
    // Esperar a que la base de datos esté lista
    await db.ready();
    console.log("   ✓ Base de datos inicializada correctamente\n");

    // Probar inserción de video
    console.log("2. Probando inserción de video...");
    const testVideoId = "test-video-123";
    db.insertVideo(testVideoId, "processing", 0);
    console.log("   ✓ Video insertado\n");

    // Probar obtención de video
    console.log("3. Probando obtención de video...");
    const video = db.getVideo(testVideoId);
    if (video) {
      console.log(`   ✓ Video obtenido: ${JSON.stringify(video)}\n`);
    } else {
      throw new Error("No se pudo obtener el video");
    }

    // Probar actualización de video
    console.log("4. Probando actualización de video...");
    db.updateVideoStatus(testVideoId, "ready", 100);
    const updatedVideo = db.getVideo(testVideoId);
    if (updatedVideo && updatedVideo.status === "ready") {
      console.log(`   ✓ Video actualizado: ${JSON.stringify(updatedVideo)}\n`);
    } else {
      throw new Error("No se pudo actualizar el video");
    }

    // Probar inserción de imagen
    console.log("5. Probando inserción de imagen...");
    const testImageId = "test-image-456";
    db.insertImage(testImageId, "test-image.jpg", "ready");
    console.log("   ✓ Imagen insertada\n");

    // Probar obtención de imagen
    console.log("6. Probando obtención de imagen...");
    const image = db.getImage(testImageId);
    if (image) {
      console.log(`   ✓ Imagen obtenida: ${JSON.stringify(image)}\n`);
    } else {
      throw new Error("No se pudo obtener la imagen");
    }

    // Probar inserción de audio
    console.log("7. Probando inserción de audio...");
    const testAudioId = "test-audio-789";
    db.insertAudio(testAudioId, "test-audio.mp3", "ready");
    console.log("   ✓ Audio insertado\n");

    // Probar obtención de audio
    console.log("8. Probando obtención de audio...");
    const audio = db.getAudio(testAudioId);
    if (audio) {
      console.log(`   ✓ Audio obtenido: ${JSON.stringify(audio)}\n`);
    } else {
      throw new Error("No se pudo obtener el audio");
    }

    // Probar listado de todos los registros
    console.log("9. Probando listado de registros...");
    const allVideos = db.getAllVideos();
    const allImages = db.getAllImages();
    const allAudios = db.getAllAudios();
    console.log(`   ✓ Videos encontrados: ${allVideos.length}`);
    console.log(`   ✓ Imágenes encontradas: ${allImages.length}`);
    console.log(`   ✓ Audios encontrados: ${allAudios.length}\n`);

    // Limpiar datos de prueba
    console.log("10. Limpiando datos de prueba...");
    db.deleteVideo(testVideoId);
    db.deleteImage(testImageId);
    db.deleteAudio(testAudioId);
    console.log("   ✓ Datos de prueba eliminados\n");

    // Cerrar conexión
    console.log("11. Cerrando conexión...");
    db.close();
    console.log("   ✓ Conexión cerrada correctamente\n");

    console.log("=== ✓ Todas las pruebas pasaron exitosamente ===");
    process.exit(0);
  } catch (error) {
    console.error("=== ✗ Error en las pruebas ===");
    console.error(error);
    process.exit(1);
  }
};

// Ejecutar las pruebas
testDatabase();

