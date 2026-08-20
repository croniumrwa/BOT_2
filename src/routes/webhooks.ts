/**
 * Rutas de Webhooks
 * Maneja webhooks de WhatsApp y Vapi/Retell para llamadas
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import whatsappService from '../services/whatsapp';
import sttTtsService from '../services/stt-tts';
import llmService from '../services/llm';

const router = Router();

// Inicializar cliente de Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

// ==========================================
// WHATSAPP WEBHOOK
// ==========================================

/**
 * GET /webhook/whatsapp
 * Verificación del webhook por Meta
 */
router.get('/whatsapp', async (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  const verifiedChallenge = whatsappService.verifyWebhook(mode, token, challenge);

  if (verifiedChallenge) {
    console.log('Webhook verificado exitosamente');
    res.status(200).send(verifiedChallenge);
  } else {
    console.log('Verificación fallida');
    res.sendStatus(403);
  }
});

/**
 * POST /webhook/whatsapp
 * Recepción de mensajes de WhatsApp (texto y audio)
 */
router.post('/whatsapp', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body;
    
    // Verificar que es un mensaje entrante
    if (body.object !== 'whatsapp_business_account') {
      res.sendStatus(404);
      return;
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      res.sendStatus(200);
      return;
    }

    // Procesar cada mensaje
    for (const message of messages) {
      await processWhatsAppMessage(message, value);
    }

    res.sendStatus(200);
  } catch (error: any) {
    console.error('Error processing WhatsApp webhook:', error);
    res.sendStatus(500);
  }
});

/**
 * Procesa un mensaje individual de WhatsApp
 */
async function processWhatsAppMessage(message: any, value: any) {
  const from = message.from;
  const messageId = message.id;
  const timestamp = new Date().toISOString();

  console.log(`Procesando mensaje de ${from}:`, message.type);

  // Marcar como leído
  await whatsappService.markAsRead(messageId);

  // Obtener o crear contacto
  const contact = await getOrCreateContact(from);
  
  // Obtener o crear conversación
  const conversation = await getOrCreateConversation(contact.id, 'whatsapp');

  let userContent = '';
  let messageType: 'text' | 'audio' = 'text';

  // Procesar según tipo de mensaje
  if (message.type === 'text') {
    userContent = message.text.body;
    messageType = 'text';
  } else if (message.type === 'audio') {
    // Descargar y transcribir audio
    const mediaId = message.audio.id;
    const audioBuffer = await whatsappService.downloadMedia(mediaId);
    userContent = await sttTtsService.transcribe(audioBuffer, 'audio.ogg');
    messageType = 'audio';
  } else if (message.type === 'voice') {
    // Nota de voz (similar a audio)
    const mediaId = message.voice.id;
    const audioBuffer = await whatsappService.downloadMedia(mediaId);
    userContent = await sttTtsService.transcribe(audioBuffer, 'audio.ogg');
    messageType = 'audio';
  } else {
    // Tipos no soportados (imagen, video, documento, etc.)
    console.log(`Tipo de mensaje no soportado: ${message.type}`);
    return;
  }

  // Guardar mensaje del usuario en Supabase
  await saveMessage(conversation.id, 'user', messageType, userContent);

  // Generar respuesta con LLM
  const llmResult = await llmService.generateResponse(
    userContent,
    contact.id,
    'whatsapp'
  );

  // Actualizar estado del contacto si debe escalar
  if (llmResult.shouldEscalate) {
    await supabase
      .from('contacts')
      .update({ status: 'contacted' })
      .eq('id', contact.id);
    
    console.log(`⚠️ Contacto ${contact.phone_number} marcado para atención humana`);
  }

  // Enviar respuesta según el tipo determinado
  if (llmResult.responseType === 'audio') {
    // Generar audio y enviar
    const audioBuffer = await sttTtsService.generateSpeech(llmResult.response);
    await whatsappService.sendAudioMessage(from, audioBuffer);
    
    // Guardar mensaje del bot (texto - la transcripción del audio generado)
    await saveMessage(conversation.id, 'bot', 'audio', llmResult.response);
  } else {
    // Enviar texto
    await whatsappService.sendTextMessage(from, llmResult.response);
    
    // Guardar mensaje del bot
    await saveMessage(conversation.id, 'bot', 'text', llmResult.response);
  }

  // Actualizar última actividad de la conversación
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);
}

/**
 * Obtiene o crea un contacto en la base de datos
 */
async function getOrCreateContact(phoneNumber: string) {
  // Buscar contacto existente
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('*')
    .eq('phone_number', phoneNumber)
    .single();

  if (existingContact) {
    return existingContact;
  }

  // Crear nuevo contacto
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      phone_number: phoneNumber,
      name: `Contacto ${phoneNumber}`,
      status: 'lead',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Error creating contact: ${error.message}`);
  }

  return newContact;
}

/**
 * Obtiene o crea una conversación
 */
async function getOrCreateConversation(contactId: string, channel: 'whatsapp' | 'phone_call') {
  // Buscar conversación existente activa (últimas 24 horas)
  const { data: existingConversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('contact_id', contactId)
    .eq('channel', channel)
    .gte('last_message_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  if (existingConversation) {
    return existingConversation;
  }

  // Crear nueva conversación
  const { data: newConversation, error } = await supabase
    .from('conversations')
    .insert({
      contact_id: contactId,
      channel: channel,
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Error creating conversation: ${error.message}`);
  }

  return newConversation;
}

/**
 * Guarda un mensaje en la base de datos
 */
async function saveMessage(
  conversationId: string,
  sender: 'user' | 'bot' | 'agent',
  type: 'text' | 'audio' | 'call_transcript',
  content: string,
  mediaUrl?: string
) {
  const { error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender: sender,
      type: type,
      content: content,
      media_url: mediaUrl,
      created_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Error saving message: ${error.message}`);
  }
}

// ==========================================
// VAPI.AI WEBHOOK (Llamadas en tiempo real)
// ==========================================

/**
 * POST /webhook/vapi
 * Recibe eventos de fin de llamada desde Vapi
 */
router.post('/vapi', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, call } = req.body;

    // Verificar firma del webhook (opcional pero recomendado)
    const signature = req.headers['x-vapi-signature'] as string;
    if (signature && process.env.VAPI_WEBHOOK_SECRET) {
      const isValid = verifyVapiSignature(req.body, signature);
      if (!isValid) {
        console.error('Firma de Vapi inválida');
        res.sendStatus(401);
        return;
      }
    }

    // Solo procesar eventos de llamada finalizada
    if (type !== 'call.end') {
      res.sendStatus(200);
      return;
    }

    console.log('Procesando llamada finalizada:', call.id);

    // Extraer información de la llamada
    const phoneNumber = call.customer?.number || call.artifact?.customerNumber;
    const transcription = call.artifact?.transcript || '';
    const summary = call.artifact?.summary || '';
    const recordingUrl = call.recordingUrl || '';
    const duration = call.durationSeconds || 0;

    if (!phoneNumber) {
      console.error('No se encontró número de teléfono en la llamada');
      res.sendStatus(200);
      return;
    }

    // Obtener o crear contacto
    const contact = await getOrCreateContact(phoneNumber);

    // Si no hay resumen generado, crearlo con LLM
    let finalSummary = summary;
    if (!finalSummary && transcription) {
      finalSummary = await llmService.summarizeCall(transcription);
    }

    // Guardar registro de la llamada
    await supabase
      .from('calls')
      .insert({
        contact_id: contact.id,
        duration_seconds: duration,
        recording_url: recordingUrl,
        summary: finalSummary,
        transcription: transcription,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Obtener o crear conversación de tipo phone_call
    const conversation = await getOrCreateConversation(contact.id, 'phone_call');

    // Guardar transcripción como mensaje en el historial
    if (transcription) {
      await saveMessage(
        conversation.id,
        'user',
        'call_transcript',
        `📞 LLAMADA TELEFÓNICA\n\n${transcription}`,
        recordingUrl
      );

      // Guardar resumen como mensaje del bot
      await saveMessage(
        conversation.id,
        'bot',
        'call_transcript',
        `📝 Resumen: ${finalSummary}`,
        undefined
      );
    }

    // Actualizar estado del contacto basado en la llamada
    if (finalSummary.toLowerCase().includes('interesado') || 
        finalSummary.toLowerCase().includes('compra') ||
        finalSummary.toLowerCase().includes('contratar')) {
      await supabase
        .from('contacts')
        .update({ status: 'qualified' })
        .eq('id', contact.id);
    }

    console.log('Llamada procesada exitosamente');
    res.sendStatus(200);
  } catch (error: any) {
    console.error('Error processing Vapi webhook:', error);
    res.sendStatus(500);
  }
});

/**
 * Verifica la firma del webhook de Vapi
 */
function verifyVapiSignature(payload: any, signature: string): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET || '';
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ==========================================
// RETELL AI WEBHOOK (Alternativa a Vapi)
// ==========================================

/**
 * POST /webhook/retell
 * Recibe eventos de fin de llamada desde Retell AI
 */
router.post('/retell', async (req: Request, res: Response): Promise<void> => {
  try {
    const { event, call } = req.body;

    // Verificar firma del webhook
    const signature = req.headers['x-retell-signature'] as string;
    if (signature && process.env.RETELL_WEBHOOK_SECRET) {
      const isValid = verifyRetellSignature(req.body, signature);
      if (!isValid) {
        console.error('Firma de Retell inválida');
        res.sendStatus(401);
        return;
      }
    }

    // Solo procesar eventos de llamada finalizada
    if (event !== 'call_ended') {
      res.sendStatus(200);
      return;
    }

    console.log('Procesando llamada finalizada (Retell):', call.call_id);

    // Extraer información
    const phoneNumber = call.customer_phone_number;
    const transcription = call.transcript || '';
    const summary = call.summary || '';
    const recordingUrl = call.recording_presigned_url || '';
    const duration = call.duration || 0;

    if (!phoneNumber) {
      console.error('No se encontró número de teléfono en la llamada');
      res.sendStatus(200);
      return;
    }

    // Obtener o crear contacto
    const contact = await getOrCreateContact(phoneNumber);

    // Generar resumen si no existe
    let finalSummary = summary;
    if (!finalSummary && transcription) {
      finalSummary = await llmService.summarizeCall(transcription);
    }

    // Guardar registro de la llamada
    await supabase
      .from('calls')
      .insert({
        contact_id: contact.id,
        duration_seconds: duration,
        recording_url: recordingUrl,
        summary: finalSummary,
        transcription: transcription,
        created_at: new Date().toISOString(),
      });

    // Obtener o crear conversación
    const conversation = await getOrCreateConversation(contact.id, 'phone_call');

    // Guardar transcripción en el historial
    if (transcription) {
      await saveMessage(
        conversation.id,
        'user',
        'call_transcript',
        `📞 LLAMADA TELEFÓNICA\n\n${transcription}`,
        recordingUrl
      );

      await saveMessage(
        conversation.id,
        'bot',
        'call_transcript',
        `📝 Resumen: ${finalSummary}`,
        undefined
      );
    }

    console.log('Llamada de Retell procesada exitosamente');
    res.sendStatus(200);
  } catch (error: any) {
    console.error('Error processing Retell webhook:', error);
    res.sendStatus(500);
  }
});

/**
 * Verifica la firma del webhook de Retell
 */
function verifyRetellSignature(payload: any, signature: string): boolean {
  const secret = process.env.RETELL_WEBHOOK_SECRET || '';
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export default router;
