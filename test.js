// Test script for Voice Grok Assistant
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function runTests() {
  console.log('🧪 Running Voice Grok Assistant Tests...\n');

  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health check passed:', healthResponse.data);

    // Test 2: Validate required environment variables
    console.log('\n2. Checking environment configuration...');
    const requiredEnvVars = [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'XAI_API_KEY',
      'ELEVENLABS_API_KEY',
      'ELEVENLABS_VOICE_ID'
    ];

    const missing = requiredEnvVars.filter(key => !process.env[key]);
    if (missing.length > 0) {
      console.log('⚠️  Missing environment variables:', missing.join(', '));
      console.log('   Please set these in your .env file');
    } else {
      console.log('✅ All required environment variables are set');
    }

    // Test 3: Validate API keys format
    console.log('\n3. Validating API key formats...');
    const validations = [
      {
        name: 'Twilio Account SID',
        value: process.env.TWILIO_ACCOUNT_SID,
        pattern: /^AC[a-f0-9]{32}$/
      },
      {
        name: 'xAI API Key',
        value: process.env.XAI_API_KEY,
        pattern: /^xai-[a-zA-Z0-9_-]+$/
      }
    ];

    validations.forEach(({ name, value, pattern }) => {
      if (value && pattern.test(value)) {
        console.log(`✅ ${name} format is valid`);
      } else if (value) {
        console.log(`⚠️  ${name} format may be invalid`);
      }
    });

    console.log('\n🎉 Basic tests completed!');
    console.log('\n📞 To test voice functionality:');
    console.log('   1. Deploy to Render or run locally with ngrok');
    console.log('   2. Configure Twilio webhook');
    console.log('   3. Call your Twilio number');
    console.log('   4. Say: "Hello Grok, what\'s the meaning of life?"');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('   Make sure the server is running: npm run dev');
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
