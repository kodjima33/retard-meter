const { execSync } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const path = require('path');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n=========================================');
console.log('Retard Meter - Setup & Dependency Check');
console.log('=========================================\n');

// Check for SoX
try {
  console.log('Checking for SoX...');
  const soxVersion = execSync('sox --version').toString();
  console.log('✅ SoX is installed: ' + soxVersion.split('\n')[0]);
} catch (error) {
  console.log('❌ SoX is not installed.');
  console.log('Please install SoX with: brew install sox');
}

// Check for BlackHole
try {
  console.log('\nChecking for BlackHole audio driver...');
  const audioDevices = execSync('system_profiler SPAudioDataType | grep -A 2 -B 2 "BlackHole\\|Soundflower"').toString();
  if (audioDevices.includes('BlackHole') || audioDevices.includes('Soundflower')) {
    console.log('✅ BlackHole or Soundflower is installed');
  } else {
    throw new Error('Not found');
  }
} catch (error) {
  console.log('❌ BlackHole audio driver is not detected');
  console.log('For system audio capture, install BlackHole with: brew install blackhole-2ch');
}

// Check for Deepgram API key
console.log('\nChecking for Deepgram API key...');
const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

if (deepgramApiKey && deepgramApiKey !== 'your_deepgram_api_key_here') {
  console.log(`✅ Deepgram API key found in environment variables`);
} else {
  console.log('❌ Deepgram API key not properly set up');
  console.log('You need to:');
  console.log('1. Create a Deepgram account at https://deepgram.com');
  console.log('2. Create a new project and generate an API key');
  console.log('3. Set DEEPGRAM_API_KEY in your .env file or environment\n');
  
  rl.question('Would you like to set the Deepgram API key now? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      rl.question('Enter your Deepgram API key: ', (apiKey) => {
        // Update .env file
        const envPath = path.join(__dirname, '.env');
        let envContent = '';
        
        try {
          if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8')
              .replace(/DEEPGRAM_API_KEY=.*/g, '');
          }
          
          // Ensure we don't have double line breaks
          envContent = envContent.trim();
          if (envContent && !envContent.endsWith('\n')) {
            envContent += '\n';
          }
          
          // Add the API key
          envContent += `DEEPGRAM_API_KEY=${apiKey}\n`;
          
          fs.writeFileSync(envPath, envContent, 'utf8');
          console.log(`✅ Successfully saved Deepgram API key to .env file`);
        } catch (error) {
          console.error(`Error updating .env file: ${error.message}`);
        }
        
        showSummary();
      });
    } else {
      showSummary();
    }
  });
} 

function showSummary() {
  console.log('\n=========================================');
  console.log('Setup Summary');
  console.log('=========================================');
  console.log('Once you have all the dependencies installed:');
  console.log('1. Run "npm start" to launch the app');
  console.log('2. Select your audio device in the dropdown');
  console.log('3. Click "Start Recording" to begin transcription');
  console.log('\nFor system audio capture, remember to set up a Multi-Output Device');
  console.log('in macOS Audio MIDI Setup that includes both your speakers and BlackHole.');
  console.log('=========================================\n');
  rl.close();
}

// If we already have credentials, show summary directly
if (deepgramApiKey && deepgramApiKey !== 'your_deepgram_api_key_here') {
  showSummary();
} 