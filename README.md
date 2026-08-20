# 🚀 CRM Multicanal con IA - Guía de Instalación y Despliegue

Sistema de Chatbot + CRM omnicanal capaz de procesar mensajes de texto, notas de voz y llamadas telefónicas en tiempo real, unificando todos los datos en una base de datos centralizada con Supabase.

---

## 📋 Tabla de Contenidos

1. [Requisitos Previos](#requisitos-previos)
2. [Configuración de Servicios Externos](#configuración-de-servicios-externos)
3. [Instalación Local](#instalación-local)
4. [Configuración de la Base de Datos](#configuración-de-la-base-de-datos)
5. [Configuración de WhatsApp](#configuración-de-whatsapp)
6. [Configuración de Llamadas (Vapi/Retell)](#configuración-de-llamadas-vapiretell)
7. [Ejecución del Proyecto](#ejecución-del-proyecto)
8. [Despliegue en Producción](#despliegue-en-producción)
9. [Pruebas y Verificación](#pruebas-y-verificación)
10. [Solución de Problemas](#solución-de-problemas)

---

## ✅ Requisitos Previos

### Software Requerido
- **Node.js** >= 18.0.0 (recomendado v20 LTS)
- **npm** o **yarn**
- **Git**

### Cuentas de Servicios Externos
- [Supabase](https://supabase.com) - Base de datos PostgreSQL
- [Meta for Developers](https://developers.facebook.com) - WhatsApp Business API
- [OpenAI](https://platform.openai.com) - LLM y Whisper STT
- [ElevenLabs](https://elevenlabs.io) - Text-to-Speech (opcional, puede usar OpenAI TTS)
- [Vapi.ai](https://vapi.ai) o [Retell AI](https://retellai.com) - Llamadas en tiempo real
- [Deepgram](https://deepgram.com) - STT alternativo (opcional)

---

## 🔧 Configuración de Servicios Externos

### 1. Supabase (Base de Datos)

1. Crea una cuenta en [supabase.com](https://supabase.com)
2. Crea un nuevo proyecto
3. Ve al **SQL Editor** y ejecuta el contenido de `schema.sql`
4. Obtén las credenciales:
   - **Project URL**: Settings → API → Project URL
   - **anon/public key**: Settings → API → anon public

### 2. Meta WhatsApp Business API

1. Ve a [developers.facebook.com](https://developers.facebook.com)
2. Crea una aplicación de tipo **Business**
3. Añade el producto **WhatsApp**
4. Configura un número de teléfono de prueba
5. Obtén las credenciales:
   - **Phone ID**: WhatsApp → API Setup → Phone ID
   - **Business Account ID**: WhatsApp → API Setup → Business Account ID
   - **Access Token**: WhatsApp → API Setup → Temporary Access Token (o permanente)
   - **Verify Token**: Crea uno propio (ej: `mi_token_secreto_123`)

### 3. OpenRouter (LLM con DeepSeek V4 Flash)

1. Crea cuenta en [openrouter.ai](https://openrouter.ai)
2. Genera una API Key en **Keys**
3. El modelo recomendado es **DeepSeek V4 Flash** (`deepseek/deepseek-chat-v4-flash`)
4. Asegúrate de tener créditos disponibles
5. Opcional: Configura un fallback a otros modelos si es necesario

### 4. OpenAI (Para Whisper STT y TTS)

1. Crea cuenta en [platform.openai.com](https://platform.openai.com)
2. Genera una API Key en **API Keys**
3. Asegúrate de tener créditos disponibles para Whisper (STT) y TTS

### 5. ElevenLabs (Opcional pero recomendado)

1. Crea cuenta en [elevenlabs.io](https://elevenlabs.io)
2. Ve a **Profile** → **API Key**
3. Copia tu API Key
4. Elige una voz predeterminada (ej: `rachel`, `adam`, `antoine`)

### 6. Vapi.ai o Retell AI (Para llamadas)

#### Opción A: Vapi.ai
1. Crea cuenta en [vapi.ai](https://vapi.ai)
2. Crea un nuevo assistant
3. Configura el webhook URL: `https://tu-dominio.com/webhook/vapi`
4. Obtén la API Key y Webhook Secret

#### Opción B: Retell AI
1. Crea cuenta en [retellai.com](https://retellai.com)
2. Crea un agent
3. Configura el webhook URL: `https://tu-dominio.com/webhook/retell`
4. Obtén la API Key y Webhook Secret

---

## 💻 Instalación Local

### Paso 1: Clonar el Repositorio

```bash
cd /workspace
# El código ya está disponible en este directorio
```

### Paso 2: Instalar Dependencias

```bash
npm install
```

### Paso 3: Configurar Variables de Entorno

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:

```env
# Servidor
PORT=3000
NODE_ENV=development

# Supabase
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-anon-key

# WhatsApp
WHATSAPP_PHONE_ID=tu-phone-id
WHATSAPP_BUSINESS_ACCOUNT_ID=tu-business-account-id
WHATSAPP_ACCESS_TOKEN=tu-access-token
WHATSAPP_VERIFY_TOKEN=mi_token_secreto_123

# OpenRouter (LLM - DeepSeek V4 Flash)
OPENROUTER_API_KEY=sk-or-tu-api-key
LLM_MODEL=deepseek/deepseek-chat-v4-flash

# OpenAI (para Whisper STT y TTS)
OPENAI_API_KEY=sk-tu-api-key

# ElevenLabs (opcional)
ELEVENLABS_API_KEY=tu-elevenlabs-key
ELEVENLABS_VOICE_ID=rachel

# Deepgram (opcional)
DEEPGRAM_API_KEY=tu-deepgram-key

# Vapi (si usas llamadas)
VAPI_API_KEY=tu-vapi-key
VAPI_WEBHOOK_SECRET=tu-vapi-secret

# URL pública (para webhooks)
WEBHOOK_BASE_URL=https://tu-dominio.com
```

---

## 🗄️ Configuración de la Base de Datos

### Ejecutar Migraciones en Supabase

1. Inicia sesión en tu dashboard de Supabase
2. Ve a **SQL Editor**
3. Copia y pega el contenido completo de `schema.sql`
4. Ejecuta el script

El esquema creará:
- ✅ Tabla `contacts` - Gestión de contactos
- ✅ Tabla `conversations` - Historial por canal
- ✅ Tabla `messages` - Todos los mensajes
- ✅ Tabla `calls` - Registro de llamadas
- ✅ Índices para optimización
- ✅ Triggers para actualización automática
- ✅ Habilitación de Supabase Realtime

---

## 📱 Configuración de WhatsApp

### Paso 1: Configurar Webhook en Meta

1. Ve a **WhatsApp** → **Configuration** en el dashboard de Meta
2. En **Webhook**, haz clic en **Edit**
3. Ingresa tu URL pública: `https://tu-dominio.com/webhook/whatsapp`
4. En **Verify Token**, usa el mismo valor que en `.env` (`WHATSAPP_VERIFY_TOKEN`)
5. Suscríbete a los siguientes eventos:
   - ✅ `messages`
   - ✅ `message_deliveries`
   - ✅ `message_reads`

### Paso 2: Probar el Webhook

Meta enviará una solicitud GET de verificación. Tu servidor responderá automáticamente con el challenge si el token coincide.

### Paso 3: Número de Prueba

Usa el número de prueba proporcionado por Meta para enviar mensajes de texto y notas de voz durante el desarrollo.

---

## 📞 Configuración de Llamadas (Vapi/Retell)

### Con Vapi.ai

1. **Crear Assistant**:
   - Ve a **Assistants** → **Create New**
   - Configura el **System Prompt** (puedes usar el mismo del archivo `llm.ts`)
   - Selecciona el modelo de voz preferido

2. **Configurar Webhook**:
   - En **Settings** → **Webhooks**
   - Añade: `https://tu-dominio.com/webhook/vapi`
   - Eventos: `call.end`

3. **Crear un Phone Number** (opcional):
   - Conecta un número de Twilio o usa los proporcionados por Vapi

4. **Probar Llamada**:
   - Usa la herramienta de prueba en el dashboard de Vapi
   - O llama al número configurado

### Con Retell AI

1. **Crear Agent**:
   - Ve a **Agents** → **Create New**
   - Configura el prompt del sistema
   - Selecciona el modelo de voz

2. **Configurar Webhook**:
   - En **Settings** → **Webhooks**
   - Añade: `https://tu-dominio.com/webhook/retell`
   - Evento: `call_ended`

3. **Deploy**:
   - Conecta un número de Twilio
   - O usa los números de Retell

---

## ▶️ Ejecución del Proyecto

### Modo Desarrollo (con auto-reload)

```bash
npm run dev
```

El servidor se iniciará en `http://localhost:3000`

### Modo Producción

```bash
# Compilar TypeScript
npm run build

# Iniciar servidor
npm start
```

### Verificar Estado

```bash
curl http://localhost:3000/health
```

Respuesta esperada:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "environment": "development"
}
```

---

## 🚀 Despliegue en Producción

### Opción 1: Railway

1. Conecta tu repositorio de GitHub
2. Añade todas las variables de entorno desde `.env`
3. Deploy automático

### Opción 2: Render

1. Crea un nuevo **Web Service**
2. Conecta tu repositorio
3. Configura:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Añade variables de entorno

### Opción 3: VPS (Ubuntu/Debian)

```bash
# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clonar repositorio
git clone <tu-repo>
cd crm-multicanal-ia

# Instalar dependencias
npm install --production

# Compilar
npm run build

# Usar PM2 para gestión de procesos
npm install -g pm2
pm2 start dist/index.js --name crm-multicanal
pm2 save
pm2 startup
```

### Tunneling para Desarrollo (ngrok)

Para exponer tu localhost públicamente durante pruebas:

```bash
# Instalar ngrok
npm install -g ngrok

# Ejecutar tunnel
ngrok http 3000
```

Usa la URL generada (ej: `https://abc123.ngrok.io`) para:
- Configurar el webhook de WhatsApp
- Configurar webhooks de Vapi/Retell
- Actualizar `WEBHOOK_BASE_URL` en `.env`

---

## 🧪 Pruebas y Verificación

### Test 1: Health Check

```bash
curl http://localhost:3000/health
```

### Test 2: Webhook de WhatsApp (GET - Verificación)

```bash
curl "http://localhost:3000/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=mi_token_secreto_123&hub.challenge=123456"
```

Debe devolver: `123456`

### Test 3: Webhook de WhatsApp (POST - Mensaje)

```bash
curl -X POST http://localhost:3000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "1234567890",
            "type": "text",
            "text": { "body": "Hola, necesito información" },
            "id": "msg_123"
          }]
        }
      }]
    }]
  }'
```

### Test 4: Verificar Base de Datos

En el SQL Editor de Supabase:

```sql
-- Ver contactos
SELECT * FROM contacts ORDER BY created_at DESC LIMIT 10;

-- Ver conversaciones
SELECT * FROM conversations ORDER BY last_message_at DESC LIMIT 10;

-- Ver mensajes
SELECT * FROM messages ORDER BY created_at DESC LIMIT 20;
```

---

## 🔍 Solución de Problemas

### Error: "Supabase credentials not configured"

**Causa**: Variables de entorno faltantes  
**Solución**: Verifica que `SUPABASE_URL` y `SUPABASE_ANON_KEY` estén en `.env`

### Error: "Failed to send text message" (WhatsApp)

**Causas posibles**:
- Token de acceso expirado (usa uno permanente)
- Phone ID incorrecto
- Número no verificado en modo sandbox

**Solución**: Verifica credenciales en Meta Dashboard

### Error: "Failed to transcribe audio"

**Causa**: API Key de OpenAI inválida o sin créditos  
**Solución**: Verifica tu cuenta en platform.openai.com

### Los webhooks no reciben eventos

**Causas**:
- URL incorrecta en configuración de Meta/Vapi
- Firewall bloqueando requests
- SSL inválido

**Solución**:
- Usa ngrok para desarrollo
- Verifica logs del servidor
- Asegura HTTPS en producción

### Error de firma en webhooks

**Causa**: Secret de webhook mal configurado  
**Solución**: Copia exactamente el mismo secret en el servicio externo y en `.env`

---

## 📊 Estructura del Proyecto

```
crm-multicanal-ia/
├── schema.sql              # Migraciones de base de datos
├── package.json            # Dependencias y scripts
├── tsconfig.json           # Configuración TypeScript
├── .env.example            # Plantilla de variables
├── .gitignore
├── README.md               # Esta guía
└── src/
    ├── index.ts            # Servidor principal
    ├── services/
    │   ├── whatsapp.ts     # API de WhatsApp
    │   ├── stt-tts.ts      # Speech-to-Text / Text-to-Speech
    │   └── llm.ts          # Orquestación del LLM
    └── routes/
        └── webhooks.ts     # Endpoints de webhooks
```

---

## 🎯 Flujo de Funcionamiento

### Mensajes de WhatsApp (Texto)
1. Usuario envía mensaje → WhatsApp Cloud API
2. Webhook recibe en `/webhook/whatsapp`
3. Se guarda en Supabase (`messages`)
4. LLM genera respuesta contextual
5. Respuesta se envía vía WhatsApp API

### Notas de Voz de WhatsApp
1. Usuario envía audio → WhatsApp Cloud API
2. Webhook descarga audio con Media API
3. Audio se transcribe con Whisper/Deepgram
4. Transcripción se procesa como texto
5. LLM genera respuesta
6. Si corresponde, TTS convierte a audio
7. Audio se envía vía WhatsApp API

### Llamadas Telefónicas
1. Usuario llama → Vapi/Retell + Twilio
2. IA maneja conversación en tiempo real
3. Al finalizar, webhook recibe transcripción
4. Se guarda en `calls` y `messages`
5. LLM genera resumen
6. Contacto se actualiza según resultado

---

## 📞 Soporte y Contribuciones

Para issues, sugerencias o contribuciones, revisa la documentación de cada servicio o consulta los logs del servidor.

**Licencia**: MIT
