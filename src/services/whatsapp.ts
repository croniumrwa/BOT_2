/**
 * Servicio de WhatsApp Cloud API
 * Maneja envío y recepción de mensajes (texto y audio)
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import os from 'os';

const WHATSAPP_BASE_URL = 'https://graph.facebook.com/v17.0';

class WhatsAppService {
  private phoneId: string;
  private accessToken: string;
  private businessAccountId: string;

  constructor() {
    this.phoneId = process.env.WHATSAPP_PHONE_ID || '';
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
  }

  /**
   * Verifica el token de webhook para Meta
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return null;
  }

  /**
   * Envía un mensaje de texto por WhatsApp
   */
  async sendTextMessage(to: string, text: string): Promise<any> {
    try {
      const response = await axios.post(
        `${WHATSAPP_BASE_URL}/${this.phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: {
            body: text,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error sending text message:', error.response?.data || error.message);
      throw new Error(`Failed to send text message: ${error.message}`);
    }
  }

  /**
   * Envía un mensaje de audio por WhatsApp
   * @param to - Número de teléfono del destinatario
   * @param audioBuffer - Buffer del archivo de audio
   * @param filename - Nombre del archivo temporal
   */
  async sendAudioMessage(to: string, audioBuffer: Buffer, filename: string = 'audio.ogg'): Promise<any> {
    try {
      // Paso 1: Subir el audio a los servidores de Meta
      const mediaId = await this.uploadMedia(audioBuffer, filename);
      
      // Paso 2: Enviar el mensaje con el media_id
      const response = await axios.post(
        `${WHATSAPP_BASE_URL}/${this.phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'audio',
          audio: {
            id: mediaId,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );
      
      return response.data;
    } catch (error: any) {
      console.error('Error sending audio message:', error.response?.data || error.message);
      throw new Error(`Failed to send audio message: ${error.message}`);
    }
  }

  /**
   * Sube un archivo de audio a los servidores de Meta
   */
  private async uploadMedia(audioBuffer: Buffer, filename: string): Promise<string> {
    const tempFilePath = path.join(os.tmpdir(), `whatsapp_audio_${Date.now()}.ogg`);
    
    try {
      // Guardar temporalmente
      fs.writeFileSync(tempFilePath, audioBuffer);
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream(tempFilePath));
      formData.append('messaging_product', 'whatsapp');
      formData.append('type', 'audio/ogg');
      
      const response = await axios.post(
        `${WHATSAPP_BASE_URL}/${this.phoneId}/media`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );
      
      return response.data.id;
    } finally {
      // Limpiar archivo temporal
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  /**
   * Descarga un archivo de audio desde Meta usando media_id
   */
  async downloadMedia(mediaId: string): Promise<Buffer> {
    try {
      // Obtener URL del media
      const mediaResponse = await axios.get(
        `${WHATSAPP_BASE_URL}/${mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );
      
      const mediaUrl = mediaResponse.data.url;
      
      // Descargar el archivo
      const fileResponse = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });
      
      return Buffer.from(fileResponse.data);
    } catch (error: any) {
      console.error('Error downloading media:', error.response?.data || error.message);
      throw new Error(`Failed to download media: ${error.message}`);
    }
  }

  /**
   * Marca un mensaje como leído
   */
  async markAsRead(messageId: string): Promise<any> {
    try {
      const response = await axios.post(
        `${WHATSAPP_BASE_URL}/${this.phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error marking message as read:', error.response?.data || error.message);
      throw new Error(`Failed to mark message as read: ${error.message}`);
    }
  }

  /**
   * Envía una plantilla pre-aprobada
   */
  async sendTemplate(to: string, templateName: string, language: string = 'es', components: any[] = []): Promise<any> {
    try {
      const response = await axios.post(
        `${WHATSAPP_BASE_URL}/${this.phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: language,
            },
            components: components,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error sending template message:', error.response?.data || error.message);
      throw new Error(`Failed to send template message: ${error.message}`);
    }
  }
}

export default new WhatsAppService();
