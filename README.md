# Voice Grok Assistant

A voice-powered AI assistant that connects phone calls to xAI's Grok using Twilio and ElevenLabs for speech processing.

## Features

- 📞 **Phone Integration**: Answer calls on any Twilio phone number
- 🧠 **Grok AI**: Powered by xAI's Grok for intelligent conversations
- 🎤 **Speech Recognition**: Built-in speech-to-text via Twilio
- 🔊 **Text-to-Speech**: Natural voice responses via ElevenLabs
- ☁️ **Cloud Hosting**: Deployed on Render for 24/7 availability

## Prerequisites

- Node.js 16+
- Twilio account with a phone number
- xAI API key
- ElevenLabs API key

## Setup

1. **Clone and Install**
   ```bash
   git clone <your-repo-url>
   cd voice-grok-assistant
   npm install
   ```

2. **Environment Variables**
   ```bash
   cp .env.example .env
   ```

   Fill in your API keys in `.env`:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`
   - `XAI_API_KEY`
   - `ELEVENLABS_API_KEY`
   - `ELEVENLABS_VOICE_ID`

3. **Configure Twilio Webhook**

   In your Twilio Console:
   - Go to Phone Numbers → Manage → Active Numbers
   - Select your phone number
   - Under "Voice & Fax", set the webhook URL to: `https://your-render-app.onrender.com/voice`
   - HTTP method: POST

4. **Run Locally**
   ```bash
   npm run dev
   ```

5. **Deploy to Render**

   - Connect your GitHub repo to Render
   - Set environment variables in Render dashboard
   - Deploy!

## API Endpoints

- `POST /voice` - Handles incoming Twilio calls
- `POST /process-speech` - Processes speech input and generates responses
- `GET /health` - Health check endpoint

## Architecture

```
Phone Call → Twilio → Webhook → Express Server → Grok API → ElevenLabs TTS → Twilio → Caller
```

## Development

The server automatically handles:
- Call initiation and conversation state
- Speech-to-text conversion via Twilio
- AI response generation via Grok
- Text-to-speech conversion via ElevenLabs
- Conversation history management

## License

MIT
