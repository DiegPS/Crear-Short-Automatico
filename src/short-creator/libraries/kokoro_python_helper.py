#!/usr/bin/env python3
"""
Helper script to generate audio using Kokoro Python library.
This script supports multiple languages including Spanish.
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

# Redirigir stderr temporalmente para capturar warnings de PyTorch
# pero asegurarnos de que stdout solo contenga JSON
import contextlib
import io

try:
    # Suprimir warnings durante la importación
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        from kokoro import KPipeline
except ImportError:
    print("ERROR: kokoro package not installed. Install with: pip install kokoro>=0.9.4", file=sys.stderr)
    sys.exit(1)

def main():
    if len(sys.argv) < 4:
        print("ERROR: Usage: python kokoro_python_helper.py <text> <voice> <lang_code> <output_path>", file=sys.stderr)
        sys.exit(1)
    
    text = sys.argv[1]
    voice = sys.argv[2]
    lang_code = sys.argv[3]
    output_path = sys.argv[4]
    
    # Language code mapping:
    # 'a' = American English, 'b' = British English, 'e' = Spanish es
    # 'f' = French, 'h' = Hindi, 'i' = Italian, 'j' = Japanese
    # 'p' = Brazilian Portuguese, 'z' = Mandarin Chinese
    
    try:
        # Redirigir stdout temporalmente para capturar solo el JSON
        original_stdout = sys.stdout
        original_stderr = sys.stderr
        
        # Crear un buffer para capturar la salida
        stdout_buffer = io.StringIO()
        stderr_buffer = io.StringIO()
        
        # Redirigir stdout y stderr temporalmente
        sys.stdout = stdout_buffer
        sys.stderr = stderr_buffer
        
        try:
            # Initialize pipeline with language code
            pipeline = KPipeline(lang_code=lang_code)
            
            # Generate audio
            audio_segments = []
            generator = pipeline(text, voice=voice, speed=1, split_pattern=r'\n+')
            
            for gs, ps, audio in generator:
                audio_segments.append(audio)
        finally:
            # Restaurar stdout y stderr
            sys.stdout = original_stdout
            sys.stderr = original_stderr
            
            # Escribir warnings capturados a stderr real
            stderr_content = stderr_buffer.getvalue()
            if stderr_content:
                print(stderr_content, file=sys.stderr, end='')
        
        # Concatenate all audio segments
        if audio_segments:
            full_audio = np.concatenate(audio_segments)
            # Save as WAV file (Kokoro uses 24000 Hz sample rate)
            sf.write(output_path, full_audio, 24000)
            
            # Calculate duration
            duration = len(full_audio) / 24000.0
            
            # Output JSON with metadata SOLO a stdout (ahora que está restaurado)
            result = {
                "success": True,
                "output_path": output_path,
                "duration": duration,
                "sample_rate": 24000
            }
            # Asegurar que solo JSON va a stdout
            print(json.dumps(result), flush=True)
        else:
            error_result = {"success": False, "error": "No audio generated"}
            print(json.dumps(error_result), file=sys.stderr)
            sys.exit(1)
            
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

