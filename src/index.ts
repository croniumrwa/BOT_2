/**
 * Servidor Principal - CRM Multicanal con IA
 * Punto de entrada de la aplicación Express
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import webhooksRouter from './routes/webhooks';

// Cargar variables de entorno
dotenv.config();

// Crear instancia de Express
const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE
// ==========================================

// Seguridad HTTP
app.use(helmet({
  contentSecurityPolicy: false, // Deshabilitado para desarrollo
}));

// CORS
app.use(cors({
  origin: process.env.WEBHOOK_BASE_URL?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Logging
app.use(morgan('combined'));

// Parseo de JSON (aumentar límite para webhooks)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==========================================
// RUTAS DE SALUD
// ==========================================

/**
 * GET /health
 * Endpoint de health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * GET /
 * Endpoint raíz con información de la API
 */
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    name: 'CRM Multicanal con IA',
    version: '1.0.0',
    description: 'Sistema de Chatbot + CRM omnicanal con soporte para texto, notas de voz y llamadas',
    endpoints: {
      health: 'GET /health',
      whatsappWebhook: 'GET/POST /webhook/whatsapp',
      vapiWebhook: 'POST /webhook/vapi',
      retellWebhook: 'POST /webhook/retell',
    },
    features: [
      'WhatsApp Cloud API (texto y audio)',
      'Speech-to-Text con Whisper/Deepgram',
      'Text-to-Speech con ElevenLabs/OpenAI',
      'LLM con GPT-4o-mini/Claude vía OpenRouter',
      'Integración con Vapi.ai para llamadas',
      'Integración con Retell AI para llamadas',
      'Base de datos Supabase con Realtime',
    ],
  });
});

// ==========================================
// RUTAS DE WEBHOOKS
// ==========================================

// Webhooks de WhatsApp y servicios de llamadas
app.use('/webhook', webhooksRouter);

// Alias sin "/webhook" para compatibilidad
app.use('/whatsapp', (req, res, next) => {
  req.url = req.url.replace(/^\/whatsapp/, '/webhook/whatsapp');
  webhooksRouter(req, res, next);
});

app.use('/vapi', (req, res, next) => {
  req.url = req.url.replace(/^\/vapi/, '/webhook/vapi');
  webhooksRouter(req, res, next);
});

app.use('/retell', (req, res, next) => {
  req.url = req.url.replace(/^\/retell/, '/webhook/retell');
  webhooksRouter(req, res, next);
});

// ==========================================
// MANEJO DE ERRORES
// ==========================================

// Error 404
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `La ruta ${req.method} ${req.path} no existe`,
  });
});

// Error handler global
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Error no manejado:', err);
  
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'Ocurrió un error inesperado',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================

const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 CRM Multicanal con IA - Servidor Iniciado           ║
║                                                           ║
║   Puerto: ${PORT}                                          ║
║   Entorno: ${(process.env.NODE_ENV || 'development').padEnd(12)}              ║
║                                                           ║
║   Endpoints disponibles:                                  ║
║   • GET  /health                                          ║
║   • GET  /                                                ║
║   • GET  /webhook/whatsapp (verificación Meta)            ║
║   • POST /webhook/whatsapp (mensajes entrantes)           ║
║   • POST /webhook/vapi (eventos de llamada)               ║
║   • POST /webhook/retell (eventos de llamada)             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n📡 Señal SIGTERM recibida. Cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado exitosamente');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n📡 Señal SIGINT recibida. Cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado exitosamente');
    process.exit(0);
  });
});

// Manejo de errores no capturados
process.on('uncaughtException', (err) => {
  console.error('❌ Excepción no capturada:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
  process.exit(1);
});

export default app;
