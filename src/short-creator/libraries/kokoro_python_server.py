#!/usr/bin/env python3
"""
Servidor Python persistente para Kokoro que mantiene el pipeline en memoria.
Esto evita tener que cargar el modelo en cada generación de audio.
"""
import sys
import json
import warnings
import os
import soundfile as sf
import numpy as np
from pathlib import Path

# Redirigir todos los warnings a stderr ANTES de importar kokoro
warnings.filterwarnings("ignore")
os.environ['PYTHONWARNINGS'] = 'ignore'

try:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        from kokoro import KPipeline
except ImportError:
    print("ERROR: kokoro package not installed. Install with: pip install kokoro>=0.9.4", file=sys.stderr)
    sys.exit(1)

# Cache de pipelines por idioma
pipelines = {}

def get_pipeline(lang_code: str):
    """Obtiene o crea un pipeline para el idioma especificado."""
    if lang_code not in pipelines:
        pipelines[lang_code] = KPipeline(lang_code=lang_code)
    return pipelines[lang_code]

def generate_audio(text: str, voice: str, lang_code: str, output_path: str):
    """Genera audio usando el pipeline cacheado."""
    try:
        pipeline = get_pipeline(lang_code)
        
        # Generate audio
        audio_segments = []
        generator = pipeline(text, voice=voice, speed=1, split_pattern=r'\n+')
        
        for gs, ps, audio in generator:
            audio_segments.append(audio)
        
        if not audio_segments:
            return {"success": False, "error": "No audio generated"}
        
        # Concatenate all audio segments
        full_audio = np.concatenate(audio_segments)
        # Save as WAV file (Kokoro uses 24000 Hz sample rate)
        sf.write(output_path, full_audio, 24000)
        
        # Calculate duration
        duration = len(full_audio) / 24000.0
        
        return {
            "success": True,
            "output_path": output_path,
            "duration": duration,
            "sample_rate": 24000
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def main():
    """Lee comandos desde stdin y ejecuta generación de audio."""
    try:
        for line in sys.stdin:
            if not line.strip():
                continue
                
            try:
                command = json.loads(line.strip())
            except json.JSONDecodeError:
                print(json.dumps({"success": False, "error": "Invalid JSON"}), flush=True)
                continue
            
            if command.get("action") == "generate":
                text = command.get("text")
                voice = command.get("voice")
                lang_code = command.get("lang_code")
                output_path = command.get("output_path")
                
                if not all([text, voice, lang_code, output_path]):
                    print(json.dumps({"success": False, "error": "Missing required parameters"}), flush=True)
                    continue
                
                result = generate_audio(text, voice, lang_code, output_path)
                print(json.dumps(result), flush=True)
                
            elif command.get("action") == "ping":
                print(json.dumps({"success": True, "message": "pong"}), flush=True)
                
            elif command.get("action") == "exit":
                break
            else:
                print(json.dumps({"success": False, "error": "Unknown action"}), flush=True)
                
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr, flush=True)

if __name__ == "__main__":
    main()

