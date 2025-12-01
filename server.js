require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Store conversation state (in production, use Redis or database)
const conversations = new Map();

// Conversation management settings
const CONVERSATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000; // Clean up every 5 minutes

// Periodic cleanup of old conversations
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [callSid, conversation] of conversations.entries()) {
    if (now - conversation.startTime > CONVERSATION_TIMEOUT) {
      conversations.delete(callSid);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} old conversations`);
  }
}, CLEANUP_INTERVAL);

// Voice endpoint for incoming calls
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  // Get caller information
  const callSid = req.body.CallSid;
  const from = req.body.From;

  console.log(`Incoming call from ${from}, CallSid: ${callSid}`);

  // Initialize conversation state
  conversations.set(callSid, {
    messages: [],
    startTime: new Date(),
    caller: from
  });

  // Greet the caller and start listening
  twiml.say({
    voice: 'alice',
    language: 'en-US'
  }, 'Hello! You are now speaking with Grok, powered by xAI. How can I help you today?');

  // Start gathering speech input with enhanced recognition
  twiml.gather({
    input: 'speech',
    timeout: 5,
    speechTimeout: 'auto',
    action: '/process-speech',
    method: 'POST',
    language: 'en-US',
    speechModel: 'phone_call',
    hints: 'hello,help,question,thanks,goodbye,yes,no',
    profanityFilter: false,
    statusCallback: '/call-end',
    statusCallbackMethod: 'POST'
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

// Process speech input
app.post('/process-speech', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult;
  const confidence = parseFloat(req.body.Confidence) || 0;

  console.log(`Speech received: "${speechResult}" (confidence: ${confidence})`);

  // Check speech recognition confidence
  if (!speechResult || confidence < 0.3) {
    // Low confidence or no speech detected
    const retryMessage = confidence < 0.3 && speechResult ?
      'I\'m not sure I understood that correctly. Could you please repeat?' :
      'I didn\'t catch that. Could you please speak clearly and try again?';

    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, retryMessage);

    twiml.gather({
      input: 'speech',
      timeout: 5,
      speechTimeout: 'auto',
      action: '/process-speech',
      method: 'POST',
      language: 'en-US',
      speechModel: 'phone_call',
      hints: 'hello,help,question,thanks,goodbye,yes,no',
      profanityFilter: false
    });
  } else {
    try {
      // Check for goodbye phrases
      const goodbyePhrases = ['goodbye', 'bye', 'see you', 'talk to you later', 'hang up', 'end call'];
      const isGoodbye = goodbyePhrases.some(phrase =>
        speechResult.toLowerCase().includes(phrase)
      );

      if (isGoodbye) {
        // End the conversation
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Goodbye! It was nice speaking with you. Have a great day!');
        twiml.hangup();
      } else {
        // Send to Grok and get response
        const grokResponse = await getGrokResponse(speechResult, callSid);

        // Convert response to speech using ElevenLabs
        const audioUrl = await generateSpeech(grokResponse);

        // Play the response
        twiml.play(audioUrl);

        // Continue listening for more input
        twiml.gather({
          input: 'speech',
          timeout: 5,
          speechTimeout: 'auto',
          action: '/process-speech',
          method: 'POST',
          language: 'en-US',
          speechModel: 'phone_call',
          hints: 'hello,help,question,thanks,goodbye,yes,no',
          profanityFilter: false
        });
      }

    } catch (error) {
      console.error('Error processing speech:', error);
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I\'m sorry, there was an error. Please try again.');

      twiml.gather({
        input: 'speech',
        timeout: 5,
        speechTimeout: 'auto',
        action: '/process-speech',
        method: 'POST',
        language: 'en-US',
        speechModel: 'phone_call',
        hints: 'hello,help,question,thanks,goodbye,yes,no',
        profanityFilter: false
      });
    }
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Grok API integration
async function getGrokResponse(message, callSid) {
  try {
    console.log('Sending to Grok:', message.substring(0, 100) + '...');

    const conversation = conversations.get(callSid) || { messages: [] };
    const messages = conversation.messages;

    // Add user message to conversation history
    messages.push({ role: 'user', content: message });

    // Keep only last 10 messages to avoid token limits
    const recentMessages = messages.slice(-10);

    // Prepare messages with system prompt
    const apiMessages = [
      {
        role: 'system',
        content: 'You are Grok, a helpful and maximally truthful AI built by xAI. You are having a voice conversation, so keep your responses conversational, concise, and natural. Avoid long explanations unless asked. Be friendly and engaging.'
      },
      ...recentMessages
    ];

    const response = await axios.post('https://api.x.ai/v1/chat/completions', {
      messages: apiMessages,
      model: 'grok-beta',
      stream: false,
      temperature: 0.7,
      max_tokens: 150 // Keep responses short for voice
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`
      },
      timeout: 10000 // 10 second timeout
    });

    if (!response.data.choices || response.data.choices.length === 0) {
      throw new Error('No response from Grok API');
    }

    const grokMessage = response.data.choices[0].message.content.trim();

    // Add Grok response to conversation history
    messages.push({ role: 'assistant', content: grokMessage });

    // Update conversation in map
    conversations.set(callSid, conversation);

    console.log('Grok response:', grokMessage.substring(0, 100) + '...');
    return grokMessage;

  } catch (error) {
    console.error('Grok API error:', error.response?.data || error.message);

    // Provide different fallback messages based on error type
    if (error.code === 'ECONNABORTED') {
      return 'I\'m taking a bit longer to think. Can you say that again?';
    }

    return 'I\'m sorry, I\'m having trouble connecting right now. Please try again.';
  }
}

// Store generated audio files temporarily (in production, use cloud storage)
const audioFiles = new Map();
let audioCounter = 0;

// ElevenLabs TTS integration
async function generateSpeech(text) {
  try {
    console.log('Generating speech for:', text.substring(0, 50) + '...');

    const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
      text: text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.5
      }
    }, {
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      responseType: 'arraybuffer'
    });

    // Store audio buffer with unique ID
    const audioId = `audio_${Date.now()}_${audioCounter++}`;
    const audioBuffer = Buffer.from(response.data);

    audioFiles.set(audioId, {
      buffer: audioBuffer,
      timestamp: Date.now(),
      contentType: 'audio/mpeg'
    });

    // Clean up old audio files (older than 10 minutes)
    cleanupOldAudio();

    // Return the URL for Twilio to play
    const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
    return `${baseUrl}/audio/${audioId}`;

  } catch (error) {
    console.error('ElevenLabs TTS error:', error.response?.data || error.message);
    throw new Error('Failed to generate speech');
  }
}

// Clean up old audio files to prevent memory leaks
function cleanupOldAudio() {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes

  for (const [audioId, data] of audioFiles.entries()) {
    if (now - data.timestamp > maxAge) {
      audioFiles.delete(audioId);
    }
  }
}

// Serve generated audio files
app.get('/audio/:audioId', (req, res) => {
  const audioId = req.params.audioId;
  const audioData = audioFiles.get(audioId);

  if (!audioData) {
    return res.status(404).send('Audio file not found');
  }

  res.set({
    'Content-Type': audioData.contentType,
    'Content-Length': audioData.buffer.length,
    'Cache-Control': 'public, max-age=600' // Cache for 10 minutes
  });

  res.send(audioData.buffer);
});

// Handle call end to clean up conversation state
app.post('/call-end', (req, res) => {
  const callSid = req.body.CallSid;
  console.log(`Call ended: ${callSid}`);

  // Clean up conversation state
  conversations.delete(callSid);

  const twiml = new twilio.twiml.VoiceResponse();
  res.type('text/xml');
  res.send(twiml.toString());
});

// Enhanced error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say('I\'m sorry, there was an unexpected error. Please try calling again.');
  res.type('text/xml');
  res.send(twiml.toString());
});

// Health check endpoint
app.get('/health', (req, res) => {
  const now = Date.now();
  const conversationStats = {
    total: conversations.size,
    active: 0,
    avgMessages: 0,
    totalMessages: 0
  };

  for (const conversation of conversations.values()) {
    if (now - conversation.startTime < CONVERSATION_TIMEOUT) {
      conversationStats.active++;
    }
    conversationStats.totalMessages += conversation.messages.length;
  }

  if (conversationStats.active > 0) {
    conversationStats.avgMessages = Math.round(conversationStats.totalMessages / conversationStats.active);
  }

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    conversations: conversationStats,
    audioFiles: audioFiles.size
  });
});

// Start server
app.listen(port, () => {
  console.log(`Voice Grok Assistant server running on port ${port}`);
});
