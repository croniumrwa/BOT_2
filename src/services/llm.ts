/**
 * Servicio de LLM (Large Language Model)
 * Orquestación del modelo de IA con System Prompt unificado
 * Soporta OpenAI y OpenRouter
 */

import axios from 'axios';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// System Prompt Unificado para el Bot
const SYSTEM_PROMPT = `Eres un asistente comercial y de atención al cliente profesional, empático y eficiente para una empresa. Tu objetivo es ayudar a los clientes con consultas, proporcionar información precisa y guiarlos en su proceso de compra o resolución de problemas.

## DIRECTRICES DE PERSONALIDAD:
- Sé amable, profesional y cercano
- Muestra empatía genuina por las preocupaciones del cliente
- Sé conciso pero completo en tus respuestas
- Mantén un tono positivo y constructivo
- Si no sabes algo, admítelo honestamente y ofrece buscar la información

## ADAPTABILIDAD MULTICANAL:

### Para mensajes de TEXTO (WhatsApp):
- Usa respuestas breves y bien estructuradas
- Incorpora emojis de forma moderada y profesional (máximo 2-3 por mensaje)
- Usa saltos de línea para mejorar la legibilidad
- Ejemplo: "¡Hola! 👋 Gracias por contactarnos..."

### Para notas de VOZ (audio transcrito):
- Escribe frases fluidas y naturales, como hablarías
- Evita listas muy estructuradas o formato complejo
- Usa lenguaje conversacional
- Ejemplo: "Hola, muchas gracias por tu mensaje. Déjame ver qué puedo hacer por ti..."

### Para LLAMADAS TELEFÓNICAS (agente de voz en tiempo real):
- Responde de forma conversacional y natural
- Haz pausas implícitas en tu redacción
- Confirma comprensión frecuentemente
- Sé más detallado pero sin monólogos largos

## MANEJO DE FALLBACK Y ESCALADO:
- Si el usuario muestra frustración, molestia o enojo, reconoce sus sentimientos y ofrece ayuda humana
- Si el usuario solicita explícitamente "hablar con una persona", "agente humano" o similar, indica que transferirás la conversación
- En estos casos, añade al final de tu respuesta: [ESCALAR_A_HUMANO]
- Ejemplos de señales de escalado:
  * "Esto es ridículo"
  * "Quiero hablar con alguien real"
  * "Nunca me entienden"
  * "¿Puedo hablar con un supervisor?"

## CONTEXTO DE LA EMPRESA:
- Empresa: [Tu Empresa]
- Productos/Servicios: [Describir según configuración]
- Horario de atención: Lunes a Viernes 9am-6pm
- Tiempo de respuesta promedio: < 5 minutos

## FORMATO DE RESPUESTA:
- No uses markdown complejo (negritas, cursivas) en exceso
- Para texto: estructura clara con párrafos cortos
- Para audio: lenguaje fluido y natural
- Nunca inventes información sobre precios, disponibilidad o políticas

## GESTIÓN DEL HISTORIAL:
- Recuerda el contexto de la conversación actual
- Si el usuario cambia de tema, adapta tu respuesta manteniendo coherencia
- Referencia información previa cuando sea relevante ("Como mencionaste antes...")

Recuerda: Tu objetivo principal es resolver la consulta del cliente de manera eficiente mientras mantienes una experiencia positiva.`;

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ConversationHistory {
  contactId: string;
  messages: Array<{
    sender: string;
    content: string;
    type: string;
    createdAt: string;
  }>;
}

class LLMService {
  private openaiApiKey: string;
  private openrouterApiKey: string;
  private model: string;
  private supabase: SupabaseClient;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.openrouterApiKey = process.env.OPENROUTER_API_KEY || '';
    this.model = process.env.LLM_MODEL || 'gpt-4o-mini';
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Obtiene el historial de conversación de un contacto
   */
  async getConversationHistory(contactId: string, limit: number = 10): Promise<Message[]> {
    try {
      // Obtener la conversación más reciente del contacto
      const { data: conversation } = await this.supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .single();

      if (!conversation) {
        return [];
      }

      // Obtener los últimos mensajes
      const { data: messages } = await this.supabase
        .from('messages')
        .select('sender, content, type, created_at')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!messages || messages.length === 0) {
        return [];
      }

      // Convertir a formato del LLM
      return messages.reverse().map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant' as 'user' | 'assistant',
        content: this.formatMessageContent(msg.content, msg.type),
      }));
    } catch (error: any) {
      console.error('Error fetching conversation history:', error.message);
      return [];
    }
  }

  /**
   * Formatea el contenido del mensaje según su tipo
   */
  private formatMessageContent(content: string, type: string): string {
    if (type === 'audio') {
      return `[Audio recibido]: ${content}`;
    } else if (type === 'call_transcript') {
      return `[Transcripción de llamada]: ${content}`;
    }
    return content;
  }

  /**
   * Determina si la respuesta debe ser audio o texto
   * Basado en el patrón de comunicación del usuario
   */
  async determineResponseFormat(contactId: string): Promise<'text' | 'audio'> {
    try {
      // Analizar los últimos 5 mensajes del usuario
      const { data: messages } = await this.supabase
        .from('messages')
        .select('sender, type')
        .eq('conversation_id', contactId)
        .eq('sender', 'user')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!messages || messages.length === 0) {
        return 'text'; // Default
      }

      // Contar tipos de mensajes del usuario
      const audioCount = messages.filter(m => m.type === 'audio').length;
      
      // Si el usuario envía principalmente audios, responder con audio
      return audioCount >= 3 ? 'audio' : 'text';
    } catch (error: any) {
      console.error('Error determining response format:', error.message);
      return 'text';
    }
  }

  /**
   * Genera una respuesta usando el LLM
   * @param userMessage - Mensaje actual del usuario
   * @param contactId - ID del contacto para obtener historial
   * @param channel - Canal de comunicación ('whatsapp' o 'phone_call')
   * @param responseType - Tipo de respuesta deseada ('text' o 'audio')
   */
  async generateResponse(
    userMessage: string,
    contactId: string,
    channel: 'whatsapp' | 'phone_call' = 'whatsapp',
    responseType: 'text' | 'audio' | null = null
  ): Promise<{
    response: string;
    shouldEscalate: boolean;
    responseType: 'text' | 'audio';
  }> {
    try {
      // Obtener historial
      const history = await this.getConversationHistory(contactId);
      
      // Determinar formato de respuesta si no se especificó
      const format = responseType || await this.determineResponseFormat(contactId);
      
      // Construir prompt específico para el canal y formato
      let channelInstruction = '';
      if (channel === 'phone_call') {
        channelInstruction = '\n\n[CONTEXTO ACTUAL: Llamada telefónica en tiempo real. Responde de forma conversacional.]';
      } else if (format === 'audio') {
        channelInstruction = '\n\n[CONTEXTO ACTUAL: Respondiendo con nota de voz. Usa lenguaje fluido y natural, sin formato complejo.]';
      } else {
        channelInstruction = '\n\n[CONTEXTO ACTUAL: Respondiendo por mensaje de texto. Puedes usar emojis moderadamente y estructura clara.]';
      }

      // Construir mensajes para el LLM
      const messages: Message[] = [
        { role: 'system', content: SYSTEM_PROMPT + channelInstruction },
        ...history,
        { role: 'user', content: userMessage },
      ];

      // Seleccionar API key según disponibilidad
      const apiKey = this.openrouterApiKey || this.openaiApiKey;
      const baseUrl = this.openrouterApiKey 
        ? 'https://openrouter.ai/api/v1' 
        : 'https://api.openai.com/v1';

      // Hacer request al LLM
      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: messages,
          temperature: 0.7,
          max_tokens: 500,
          top_p: 1,
          frequency_penalty: 0.3,
          presence_penalty: 0.3,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(this.openrouterApiKey && {
              'HTTP-Referer': process.env.WEBHOOK_BASE_URL || 'http://localhost:3000',
              'X-Title': 'CRM Multicanal IA',
            }),
          },
        }
      );

      const assistantResponse = response.data.choices[0].message.content;

      // Detectar si debe escalar a humano
      const shouldEscalate = assistantResponse.includes('[ESCALAR_A_HUMANO]');
      
      // Limpiar la respuesta de marcadores internos
      const cleanResponse = assistantResponse.replace(/\[ESCALAR_A_HUMANO\]/g, '').trim();

      return {
        response: cleanResponse,
        shouldEscalate,
        responseType: format,
      };
    } catch (error: any) {
      console.error('Error generating LLM response:', error.response?.data || error.message);
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }

  /**
   * Genera un resumen de conversación para guardar en calls
   */
  async summarizeCall(transcription: string): Promise<string> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'Resume esta transcripción de llamada telefónica en 2-3 oraciones concisas. Incluye: propósito de la llamada, puntos clave discutidos, y cualquier acción pendiente o compromiso adquirido.',
            },
            {
              role: 'user',
              content: transcription,
            },
          ],
          temperature: 0.5,
          max_tokens: 200,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.openaiApiKey}`,
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('Error summarizing call:', error.message);
      return 'Resumen no disponible';
    }
  }

  /**
   * Extrae intención y entidades del mensaje (para analytics)
   */
  async extractIntent(message: string): Promise<{ intent: string; entities: Record<string, any> }> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'Analiza este mensaje y extrae: 1) La intención principal (consulta, compra, soporte, queja, saludo, despedida), 2) Entidades relevantes (productos, fechas, números, nombres). Responde SOLO en JSON: {"intent": "...", "entities": {}}',
            },
            {
              role: 'user',
              content: message,
            },
          ],
          temperature: 0.3,
          max_tokens: 150,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.openaiApiKey}`,
          },
        }
      );

      const result = JSON.parse(response.data.choices[0].message.content);
      return result;
    } catch (error: any) {
      console.error('Error extracting intent:', error.message);
      return { intent: 'unknown', entities: {} };
    }
  }
}

export default new LLMService();
