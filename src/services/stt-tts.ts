/**
 * Servicios de Speech-to-Text (STT) y Text-to-Speech (TTS)
 * Soporta OpenAI Whisper y ElevenLabs
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import os from 'os';

class STTTSService {
  private openaiApiKey: string;
  private elevenlabsApiKey: string;
  private elevenlabsVoiceId: string;
  private deepgramApiKey: string;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.elevenlabsApiKey = process.env.ELEVENLABS_API_KEY || '';
    this.elevenlabsVoiceId = process.env.ELEVENLABS_VOICE_ID || 'rachel';
    this.deepgramApiKey = process.env.DEEPGRAM_API_KEY || '';
  }

  /**
   * Convierte audio a texto usando OpenAI Whisper
   * @param audioBuffer - Buffer del archivo de audio (OGG, WAV, MP3, etc.)
   * @param filename - Nombre del archivo con extensión
   */
  async transcribeWithWhisper(audioBuffer: Buffer, filename: string = 'audio.ogg'): Promise<string> {
    const tempFilePath = path.join(os.tmpdir(), `whisper_${Date.now()}_${filename}`);
    
    try {
      // Guardar temporalmente
      fs.writeFileSync(tempFilePath, audioBuffer);
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream(tempFilePath));
      formData.append('model', 'whisper-1');
      formData.append('language', 'es'); // Español por defecto
      
      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.openaiApiKey}`,
          },
        }
      );
      
      return response.data.text;
    } catch (error: any) {
      console.error('Error transcribing with Whisper:', error.response?.data || error.message);
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    } finally {
      // Limpiar archivo temporal
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  /**
   * Alternativa: Convierte audio a texto usando Deepgram (más rápido y económico)
   */
  async transcribeWithDeepgram(audioBuffer: Buffer): Promise<string> {
    try {
      const response = await axios.post(
        'https://api.deepgram.com/v1/listen?model=nova-2&language=es&smart_format=true',
        audioBuffer,
        {
          headers: {
            'Authorization': `Token ${this.deepgramApiKey}`,
            'Content-Type': 'audio/ogg',
          },
        }
      );
      
      return response.data.results.channels[0].alternatives[0].transcript;
    } catch (error: any) {
      console.error('Error transcribing with Deepgram:', error.response?.data || error.message);
      throw new Error(`Failed to transcribe audio with Deepgram: ${error.message}`);
    }
  }

  /**
   * Convierte texto a audio usando ElevenLabs (voz más natural)
   * @param text - Texto a convertir
   * @param voiceId - ID de la voz (opcional, usa el configurado por defecto)
   */
  async generateSpeechWithElevenLabs(text: string, voiceId?: string): Promise<Buffer> {
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || this.elevenlabsVoiceId}`,
        {
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.elevenlabsApiKey,
          },
          responseType: 'arraybuffer',
        }
      );
      
      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('Error generating speech with ElevenLabs:', error.response?.data || error.message);
      throw new Error(`Failed to generate speech: ${error.message}`);
    }
  }

  /**
   * Alternativa: Convierte texto a audio usando OpenAI TTS
   * @param text - Texto a convertir
   * @param voice - Nombre de la voz (alloy, echo, fable, onyx, nova, shimmer)
   */
  async generateSpeechWithOpenAI(text: string, voice: string = 'alloy'): Promise<Buffer> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/audio/speech',
        {
          model: 'tts-1-hd',
          input: text,
          voice: voice,
          response_format: 'opus', // Formato optimizado para WhatsApp
          speed: 1.0,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.openaiApiKey}`,
          },
          responseType: 'arraybuffer',
        }
      );
      
      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('Error generating speech with OpenAI:', error.response?.data || error.message);
      throw new Error(`Failed to generate speech with OpenAI: ${error.message}`);
    }
  }

  /**
   * Método unificado para transcripción (usa Deepgram si está disponible, sino Whisper)
   */
  async transcribe(audioBuffer: Buffer, filename: string = 'audio.ogg'): Promise<string> {
    if (this.deepgramApiKey) {
      return this.transcribeWithDeepgram(audioBuffer);
    }
    return this.transcribeWithWhisper(audioBuffer, filename);
  }

  /**
   * Método unificado para síntesis de voz (usa ElevenLabs si está disponible, sino OpenAI)
   */
  async generateSpeech(text: string): Promise<Buffer> {
    if (this.elevenlabsApiKey) {
      return this.generateSpeechWithElevenLabs(text);
    }
    return this.generateSpeechWithOpenAI(text);
  }

  /**
   * Obtiene la lista de voces disponibles en ElevenLabs
   */
  async getElevenLabsVoices(): Promise<any[]> {
    try {
      const response = await axios.get(
        'https://api.elevenlabs.io/v1/voices',
        {
          headers: {
            'xi-api-key': this.elevenlabsApiKey,
          },
        }
      );
      return response.data.voices;
    } catch (error: any) {
      console.error('Error fetching ElevenLabs voices:', error.response?.data || error.message);
      return [];
    }
  }
}

export default new STTTSService();
