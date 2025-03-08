const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const AudioRecorder = require('node-audiorecorder');
const fs = require('fs');
const { Deepgram } = require('@deepgram/sdk');
const { execSync } = require('child_process');
const OpenAI = require('openai');
require('dotenv').config();

// Keep a global reference of the window object
let mainWindow;

// Flag to track if recording is active
let isRecording = false;
let audioRecorder = null;
let deepgramLive = null;
let selectedDevice = null;
let audioDataBuffer = [];
let deepgramReady = false;
let openai = null;
let transcriptBuffer = [];
const ANALYSIS_INTERVAL = 3000; // Analyze every 3 seconds
let analysisTimer = null;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the index.html of the app
  mainWindow.loadFile('index.html');

  // Initialize OpenAI
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (openaiApiKey) {
      openai = new OpenAI({
        apiKey: openaiApiKey
      });
      console.log('OpenAI initialized successfully');
    } else {
      console.error('OpenAI API key not found in environment');
    }
  } catch (error) {
    console.error('Error initializing OpenAI:', error);
  }

  // Open DevTools during development (comment out in production)
  // mainWindow.webContents.openDevTools();

  // Send available audio devices to the renderer
  setTimeout(getAudioDevices, 1000);

  mainWindow.on('closed', function () {
    mainWindow = null;
    stopRecording();
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// Get available audio input devices
function getAudioDevices() {
  try {
    // On macOS, use system command to get audio devices
    if (process.platform === 'darwin') {
      try {
        const devices = [];
        // Add default options
        devices.push('Default Microphone');
        devices.push('System Audio (requires BlackHole)');
        
        // Try to detect BlackHole if installed
        try {
          const audioDevices = execSync('system_profiler SPAudioDataType').toString();
          if (audioDevices.includes('BlackHole')) {
            console.log('BlackHole detected in system');
            // BlackHole is installed
            devices.push('BlackHole 2ch');
          }
          
          // Detect other input devices
          const inputDevices = audioDevices.split('Input Sources:');
          if (inputDevices.length > 1) {
            const inputSection = inputDevices[1].split('Output Devices:')[0];
            const deviceLines = inputSection.split('\n');
            deviceLines.forEach(line => {
              const trimmedLine = line.trim();
              if (trimmedLine && !trimmedLine.includes('Input Sources') && 
                  !devices.includes(trimmedLine) && 
                  !trimmedLine.includes(':')) {
                devices.push(trimmedLine);
              }
            });
          }
        } catch (e) {
          console.error('Error detecting audio devices:', e);
        }

        if (mainWindow) {
          mainWindow.webContents.send('available-devices', devices);
        }
      } catch (error) {
        console.error('Error finding audio devices:', error);
        // Send at least default device
        if (mainWindow) {
          mainWindow.webContents.send('available-devices', [
            'Default Microphone',
            'System Audio (requires BlackHole)'
          ]);
        }
      }
    }
  } catch (error) {
    console.error('Error getting audio devices:', error);
    // Send empty list in case of error
    if (mainWindow) {
      mainWindow.webContents.send('available-devices', [
        'Default Microphone',
        'System Audio (requires BlackHole)'
      ]);
    }
  }
}

// Handle recording start/stop
ipcMain.on('toggle-recording', (event, deviceName) => {
  if (isRecording) {
    stopRecording();
    if (mainWindow) {
      mainWindow.webContents.send('recording-status', false);
    }
  } else {
    selectedDevice = deviceName;
    startRecording();
    if (mainWindow) {
      mainWindow.webContents.send('recording-status', true);
    }
  }
});

// Handle device selection
ipcMain.on('select-device', (event, deviceName) => {
  selectedDevice = deviceName;
  console.log('Selected device:', selectedDevice);
});

// Analyze speech with OpenAI to determine "retard meter" value
async function analyzeWithOpenAI(text) {
  if (!openai || !text || text.trim() === '') {
    return null;
  }
  
  try {
    console.log('Analyzing speech with OpenAI:', text);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Your task is to evaluate the clarity and coherence of the given speech transcript. Rate it on a scale from 0 to 100, where 0 is completely clear and coherent, and 100 is completely incoherent, confused, or nonsensical. This is for a 'retard meter' app that humorously rates speech. Return ONLY a JSON object with the format: {\"score\": number, \"reason\": \"brief explanation\"}"
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.7,
      max_tokens: 150,
    });
    
    const resultText = response.choices[0].message.content.trim();
    console.log('OpenAI response:', resultText);
    
    try {
      // Extract the JSON from the response
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return result;
      }
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
    }
    
    // Fallback: try to extract just the score
    const scoreMatch = resultText.match(/["']?score["']?\s*:\s*(\d+)/i);
    if (scoreMatch && scoreMatch[1]) {
      return {
        score: parseInt(scoreMatch[1], 10),
        reason: "Extracted score only"
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error analyzing with OpenAI:', error);
    return null;
  }
}

// Analyze accumulated transcripts
async function analyzeAccumulatedTranscripts() {
  if (transcriptBuffer.length === 0 || !isRecording) {
    return;
  }
  
  const textToAnalyze = transcriptBuffer.join(' ');
  transcriptBuffer = []; // Clear buffer after analysis
  
  const result = await analyzeWithOpenAI(textToAnalyze);
  
  if (result && typeof result.score === 'number' && mainWindow) {
    console.log(`Retard meter score: ${result.score}, reason: ${result.reason}`);
    mainWindow.webContents.send('retard-meter', {
      score: result.score,
      reason: result.reason,
      analyzedText: textToAnalyze
    });
  }
}

// Send audio data to Deepgram if connection is ready
function sendToDeepgram(data) {
  if (!isRecording) return;
  
  if (deepgramReady && deepgramLive) {
    try {
      deepgramLive.send(data);
    } catch (error) {
      console.error('Error sending data to Deepgram:', error);
    }
  } else {
    // Buffer the audio data if connection isn't ready yet
    audioDataBuffer.push(data);
  }
}

// Process any buffered audio data
function processAudioBuffer() {
  if (!deepgramReady || !deepgramLive || !isRecording) return;

  while (audioDataBuffer.length > 0 && isRecording) {
    const data = audioDataBuffer.shift();
    try {
      deepgramLive.send(data);
    } catch (error) {
      console.error('Error sending buffered data to Deepgram:', error);
      // If we encounter an error, stop trying to process the buffer
      break;
    }
  }
  
  // Clear buffer if we're not recording anymore
  if (!isRecording) {
    audioDataBuffer = [];
  }
}

// Add a function to show audio setup instructions
function showAudioSetupInstructions() {
  if (!mainWindow) return;
  
  const setupInstructions = {
    title: 'Audio Setup Instructions',
    message: `
To capture system audio (like music, videos, or other apps):

1. Make sure BlackHole is installed: 
   \`brew install blackhole-2ch\`

2. Open Audio MIDI Setup (in Applications/Utilities)

3. Create a Multi-Output Device:
   - Click the + button at the bottom left
   - Select "Create Multi-Output Device"
   - Check both your speakers and "BlackHole 2ch"
   - Make this your default output in System Settings > Sound

4. In this app, select "System Audio (requires BlackHole)" 
   or "BlackHole 2ch" from the dropdown

5. Now all system audio will be captured

Would you like to open Audio MIDI Setup now?
    `
  };
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: setupInstructions.title,
    message: setupInstructions.title,
    detail: setupInstructions.message,
    buttons: ['Open Audio MIDI Setup', 'Later'],
    defaultId: 0
  }).then(result => {
    if (result.response === 0) {
      // Open Audio MIDI Setup
      execSync('open -a "Audio MIDI Setup"');
    }
  }).catch(err => {
    console.error('Error showing message box:', err);
  });
}

// Add handler for audio setup help
ipcMain.on('show-audio-setup', () => {
  showAudioSetupInstructions();
});

// Function to start recording
function startRecording() {
  if (isRecording) return;
  
  try {
    console.log('Starting audio recording...');
    audioDataBuffer = [];
    deepgramReady = false;
    transcriptBuffer = [];
    
    // Check if user selected system audio but BlackHole might not be set up
    if (selectedDevice === 'System Audio (requires BlackHole)') {
      // Try to find BlackHole
      try {
        const audioDevices = execSync('system_profiler SPAudioDataType').toString();
        if (!audioDevices.includes('BlackHole')) {
          // BlackHole not found
          if (mainWindow) {
            mainWindow.webContents.send('transcription', {
              text: 'BlackHole audio driver not detected. Please install it to capture system audio.',
              isFinal: true
            });
            
            showAudioSetupInstructions();
            return;
          }
        }
        // If BlackHole is found, use it
        selectedDevice = 'BlackHole 2ch';
      } catch (e) {
        console.error('Error checking for BlackHole:', e);
        // Continue with default device
      }
    }
    
    // Initialize Deepgram first
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    
    if (!deepgramApiKey) {
      throw new Error('Deepgram API key is not set. Please set DEEPGRAM_API_KEY in your environment or .env file.');
    }
    
    const deepgram = new Deepgram(deepgramApiKey);
    
    // Create a live transcription connection
    deepgramLive = deepgram.transcription.live({
      punctuate: true,
      language: 'en-US',
      model: 'general',
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1,
      interim_results: true
    });
    
    // Set flag to true so we know we're in the process of starting recording
    isRecording = true;
    
    // Start the analysis timer
    analysisTimer = setInterval(analyzeAccumulatedTranscripts, ANALYSIS_INTERVAL);
    
    // Handle Deepgram events
    deepgramLive.addListener('open', () => {
      console.log('Deepgram connection established');
      deepgramReady = true;
      
      if (mainWindow) {
        mainWindow.webContents.send('transcription', {
          text: 'Connected to Deepgram. Listening...',
          isFinal: true
        });
      }
      
      // Process any audio data that was buffered before connection was ready
      processAudioBuffer();
    });
    
    deepgramLive.addListener('transcriptReceived', (transcription) => {
      try {
        // Check if we received a string (happens with some Deepgram implementations)
        if (typeof transcription === 'string') {
          try {
            transcription = JSON.parse(transcription);
          } catch (e) {
            console.error('Failed to parse transcription string:', e);
          }
        }

        console.log('Received transcription from Deepgram:', 
          typeof transcription === 'string' ? transcription : JSON.stringify(transcription));
        
        // Process the transcription
        if (mainWindow) {
          let hasContent = false;
          let text = '';
          let isFinal = false;
          
          // Extract important information
          if (transcription && transcription.channel && 
              transcription.channel.alternatives && 
              transcription.channel.alternatives[0]) {
            
            const transcript = transcription.channel.alternatives[0].transcript;
            
            // Check if there's actual content
            if (transcript && transcript.trim() !== '') {
              hasContent = true;
              text = transcript;
              isFinal = transcription.is_final === true;
              
              console.log(`Sending to renderer: "${text}" (${isFinal ? 'final' : 'interim'})`);
              
              // Send the transcription to the renderer process
              mainWindow.webContents.send('transcription', {
                text: text,
                isFinal: isFinal
              });
              
              // Add to transcript buffer for analysis
              if (isFinal) {
                transcriptBuffer.push(text);
              }
            }
          }
          
          if (!hasContent) {
            console.log('Received transcription with no usable content');
          }
        }
      } catch (error) {
        console.error('Error processing transcription:', error);
      }
    });
    
    deepgramLive.addListener('error', (error) => {
      console.error('Error from Deepgram:', error);
      if (mainWindow) {
        mainWindow.webContents.send('transcription', {
          text: `Deepgram Error: ${error.message || 'Unknown error'}`,
          isFinal: true
        });
      }
    });
    
    deepgramLive.addListener('close', () => {
      console.log('Deepgram connection closed');
      deepgramReady = false;
      deepgramLive = null;
    });
    
    // Configure audio recorder with the selected device
    console.log('Using audio device:', selectedDevice);
    audioRecorder = new AudioRecorder({
      program: 'sox',      // Which program to use, either 'sox', 'rec', or 'arecord'
      device: selectedDevice && 
              selectedDevice !== 'Default Microphone' && 
              selectedDevice !== 'System Audio (requires BlackHole)' ? 
              selectedDevice : null,
      bits: 16,            // Sample size
      channels: 1,         // Number of channels
      encoding: 'signed-integer',
      rate: 16000,         // Sample rate
      type: 'wav',         // Format type
      silence: 0,
      threshold: 0,
      keepSilence: true
    });
    
    console.log('Audio recorder created');
    
    // Start recording AFTER Deepgram connection is set up
    const audioStream = audioRecorder.start().stream();
    console.log('Recording started');
    
    // Pipe the audio stream directly to Deepgram without VAD
    audioStream
      .on('error', error => {
        console.error('Error in audio stream:', error);
        if (mainWindow) {
          mainWindow.webContents.send('transcription', {
            text: `Audio Error: ${error.message}. Make sure SoX is installed.`,
            isFinal: true
          });
        }
      })
      .on('data', (data) => {
        if (isRecording) {
          sendToDeepgram(data);
        }
      });
    
  } catch (error) {
    console.error('Failed to start recording:', error);
    if (mainWindow) {
      mainWindow.webContents.send('transcription', {
        text: `Failed to start recording: ${error.message}`,
        isFinal: true
      });
    }
    stopRecording();
  }
}

// Function to stop recording
function stopRecording() {
  if (!isRecording) return;
  
  isRecording = false;
  deepgramReady = false;
  audioDataBuffer = [];
  
  // Clear the analysis timer
  if (analysisTimer) {
    clearInterval(analysisTimer);
    analysisTimer = null;
  }
  
  // Perform final analysis if there's data
  if (transcriptBuffer.length > 0) {
    analyzeAccumulatedTranscripts();
  }
  
  try {
    if (audioRecorder) {
      audioRecorder.stop();
      console.log('Recording stopped');
      audioRecorder = null;
    }
    
    if (deepgramLive) {
      // Give it a moment to process any final transcripts
      setTimeout(() => {
        try {
          deepgramLive.finish();
          deepgramLive = null;
        } catch (err) {
          console.error('Error closing Deepgram connection:', err);
        }
      }, 500);
    }
  } catch (error) {
    console.error('Error stopping recording:', error);
  }
}

// Check for macOS permissions
app.whenReady().then(() => {
  // On macOS, we need to request microphone permissions
  if (process.platform === 'darwin') {
    try {
      const { systemPreferences } = require('electron');
      if (!systemPreferences.getMediaAccessStatus('microphone')) {
        console.log('Requesting microphone permission...');
        systemPreferences.askForMediaAccess('microphone');
      }
    } catch (error) {
      console.error('Error checking microphone permissions:', error);
    }
  }
}); 