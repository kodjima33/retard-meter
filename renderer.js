// DOM Elements
const toggleRecordingButton = document.getElementById('toggleRecording');
const statusIndicator = document.getElementById('status');
const transcriptContainer = document.getElementById('transcript');
const deviceSelector = document.createElement('select');
let audioSetupButton = null;

// Retard meter elements to be created
let retardMeterContainer = null;
let retardMeterValueBar = null;
let retardMeterPercentage = null;
let retardMeterReason = null;

// State
let isRecording = false;
let currentInterimElement = null;
let transcriptHistory = [];
const MAX_HISTORY_LENGTH = 50; // Maximum number of transcript items to keep

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.api.log('DOM fully loaded');

  // Add device selector to header controls
  deviceSelector.id = 'deviceSelector';
  deviceSelector.className = 'device-selector';
  const defaultOption = document.createElement('option');
  defaultOption.textContent = 'Default Microphone';
  defaultOption.value = '';
  deviceSelector.appendChild(defaultOption);
  
  const controlsDiv = document.querySelector('.controls');
  controlsDiv.insertBefore(deviceSelector, statusIndicator);
  
  // Add audio setup help button
  audioSetupButton = document.createElement('button');
  audioSetupButton.textContent = '?';
  audioSetupButton.title = 'Audio Setup Help';
  audioSetupButton.className = 'help-btn';
  audioSetupButton.addEventListener('click', () => {
    window.api.send('show-audio-setup');
  });
  controlsDiv.insertBefore(audioSetupButton, statusIndicator);
  
  // Add a clear button
  const clearButton = document.createElement('button');
  clearButton.textContent = 'Clear';
  clearButton.className = 'clear-btn';
  clearButton.addEventListener('click', clearTranscript);
  controlsDiv.appendChild(clearButton);
  
  // Create retard meter UI
  createRetardMeterUI();
  
  // Setup event listeners
  toggleRecordingButton.addEventListener('click', toggleRecording);
  
  deviceSelector.addEventListener('change', (event) => {
    window.api.send('select-device', event.target.value);
    
    // Show audio setup button if system audio is selected
    if (event.target.value === 'System Audio (requires BlackHole)') {
      audioSetupButton.style.display = 'inline-block';
      audioSetupButton.classList.add('highlight');
      
      // Add a helpful message
      const helpElement = document.createElement('p');
      helpElement.textContent = 'You selected System Audio. Click the "?" button for setup instructions.';
      helpElement.className = 'system-message help-message';
      transcriptContainer.appendChild(helpElement);
      transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
    } else {
      audioSetupButton.classList.remove('highlight');
    }
  });
  
  // Listen for transcription updates from main process
  window.api.receive('transcription', (data) => {
    window.api.log(`RECEIVED FROM MAIN: ${JSON.stringify(data)}`);
    
    // Show reception in UI for debugging
    const debugMsg = document.createElement('div');
    debugMsg.className = 'debug-message';
    debugMsg.textContent = new Date().toLocaleTimeString() + ' Received: ' + 
      (data && data.text ? data.text : 'empty');
    debugMsg.style.position = 'fixed';
    debugMsg.style.bottom = '10px';
    debugMsg.style.right = '10px';
    debugMsg.style.backgroundColor = 'rgba(0,0,0,0.7)';
    debugMsg.style.color = 'white';
    debugMsg.style.padding = '5px 10px';
    debugMsg.style.borderRadius = '5px';
    debugMsg.style.zIndex = '1000';
    document.body.appendChild(debugMsg);
    
    // Auto-remove debug message after 3 seconds
    setTimeout(() => {
      document.body.removeChild(debugMsg);
    }, 3000);
    
    if (data && typeof data.text === 'string') {
      updateTranscript(data.text, data.isFinal);
    } else {
      window.api.log('Invalid transcription data received');
    }
  });
  
  // Listen for retard meter updates
  window.api.receive('retard-meter', (data) => {
    window.api.log(`RETARD METER UPDATE: ${JSON.stringify(data)}`);
    if (data && typeof data.score === 'number') {
      updateRetardMeter(data.score, data.reason, data.analyzedText);
    }
  });
  
  // Listen for recording status updates
  window.api.receive('recording-status', (recordingStatus) => {
    window.api.log(`Recording status changed: ${recordingStatus}`);
    isRecording = recordingStatus;
    updateUIState();
    
    if (recordingStatus) {
      // Add a "Started listening..." message
      const startElement = document.createElement('p');
      startElement.textContent = 'Started listening...';
      startElement.className = 'system-message';
      transcriptContainer.appendChild(startElement);
      transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
      
      // Reset retard meter
      updateRetardMeter(0, 'Waiting for speech...', '');
    } else {
      // Add a "Stopped recording" message
      const stopElement = document.createElement('p');
      stopElement.textContent = 'Stopped recording.';
      stopElement.className = 'system-message';
      transcriptContainer.appendChild(stopElement);
      transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
      
      // If there's still an interim element, finalize it
      if (currentInterimElement) {
        currentInterimElement.classList.remove('interim');
        currentInterimElement.classList.add('final');
        currentInterimElement = null;
      }
    }
  });
  
  // Listen for available devices
  window.api.receive('available-devices', (devices) => {
    window.api.log(`Received devices: ${JSON.stringify(devices)}`);
    updateDeviceList(devices);
  });
  
  // Add debug button
  const debugButton = document.createElement('button');
  debugButton.textContent = 'Debug';
  debugButton.className = 'debug-btn';
  debugButton.addEventListener('click', () => {
    const debugInfo = document.createElement('p');
    debugInfo.className = 'debug-info';
    debugInfo.textContent = `Recording: ${isRecording}, Device: ${deviceSelector.value}, History: ${transcriptHistory.length} items`;
    transcriptContainer.appendChild(debugInfo);
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
  });
  controlsDiv.appendChild(debugButton);
  
  // Add initial welcome message
  const welcomeElement = document.createElement('p');
  welcomeElement.textContent = 'Welcome to Retard Meter! Select a device and click "Start Recording" to begin transcription.';
  welcomeElement.className = 'system-message welcome';
  transcriptContainer.appendChild(welcomeElement);
  
  // Add system audio tip
  const systemAudioTip = document.createElement('p');
  systemAudioTip.innerHTML = '<strong>Tip:</strong> To capture system audio (music, videos, etc), select "System Audio" from the dropdown and click the "?" button for setup instructions.';
  systemAudioTip.className = 'system-message tip';
  transcriptContainer.appendChild(systemAudioTip);
});

// Create the retard meter UI components
function createRetardMeterUI() {
  // Create container
  retardMeterContainer = document.createElement('div');
  retardMeterContainer.className = 'retard-meter-container';
  
  // Create title
  const title = document.createElement('h2');
  title.textContent = 'Retard Meter';
  retardMeterContainer.appendChild(title);
  
  // Create meter bar container
  const meterBarContainer = document.createElement('div');
  meterBarContainer.className = 'meter-bar-container';
  
  // Create meter bar
  retardMeterValueBar = document.createElement('div');
  retardMeterValueBar.className = 'meter-bar-value';
  retardMeterValueBar.style.width = '0%';
  meterBarContainer.appendChild(retardMeterValueBar);
  
  // Create percentage display
  retardMeterPercentage = document.createElement('div');
  retardMeterPercentage.className = 'meter-percentage';
  retardMeterPercentage.textContent = '0%';
  
  // Create reason display
  retardMeterReason = document.createElement('div');
  retardMeterReason.className = 'meter-reason';
  retardMeterReason.textContent = 'Waiting for speech...';
  
  // Append all elements to container
  retardMeterContainer.appendChild(meterBarContainer);
  retardMeterContainer.appendChild(retardMeterPercentage);
  retardMeterContainer.appendChild(retardMeterReason);
  
  // Insert before transcript container
  const container = document.querySelector('.container');
  const transcriptContainer = document.querySelector('.transcript-container');
  container.insertBefore(retardMeterContainer, transcriptContainer);
}

// Update the retard meter display
function updateRetardMeter(score, reason, analyzedText) {
  if (!retardMeterContainer) return;
  
  // Update the value bar width
  retardMeterValueBar.style.width = `${score}%`;
  
  // Update the percentage text
  retardMeterPercentage.textContent = `${score}%`;
  
  // Update the reason text
  retardMeterReason.textContent = reason || 'No explanation provided';
  
  // Set color based on score
  if (score < 30) {
    retardMeterValueBar.style.backgroundColor = '#34c759'; // Green for low scores
  } else if (score < 70) {
    retardMeterValueBar.style.backgroundColor = '#ff9500'; // Orange for medium scores
  } else {
    retardMeterValueBar.style.backgroundColor = '#ff3b30'; // Red for high scores
  }
  
  // Add analyzed text as a data attribute
  retardMeterContainer.setAttribute('data-analyzed-text', analyzedText || '');
  
  // Animate the change
  retardMeterContainer.classList.add('updated');
  setTimeout(() => {
    retardMeterContainer.classList.remove('updated');
  }, 500);
}

// Update device selector with available devices
function updateDeviceList(devices) {
  // Clear existing options except the default
  while (deviceSelector.options.length > 1) {
    deviceSelector.options.remove(1);
  }
  
  // Add devices to selector
  devices.forEach(device => {
    const option = document.createElement('option');
    option.textContent = device;
    option.value = device;
    deviceSelector.appendChild(option);
  });
}

// Toggle recording state
function toggleRecording() {
  const selectedDevice = deviceSelector.value;
  window.api.send('toggle-recording', selectedDevice);
}

// Update UI based on recording state
function updateUIState() {
  if (isRecording) {
    toggleRecordingButton.textContent = 'Stop Recording';
    toggleRecordingButton.classList.add('active');
    statusIndicator.textContent = 'Recording';
    statusIndicator.classList.add('recording');
    deviceSelector.disabled = true;
  } else {
    toggleRecordingButton.textContent = 'Start Recording';
    toggleRecordingButton.classList.remove('active');
    statusIndicator.textContent = 'Idle';
    statusIndicator.classList.remove('recording');
    deviceSelector.disabled = false;
  }
}

// Update transcript with new speech data
function updateTranscript(text, isFinal) {
  if (!text || text.trim() === '') return;
  
  window.api.log(`Updating transcript: "${text}" (isFinal: ${isFinal})`);
  
  // Always create a new element for better visibility of updates
  const element = document.createElement('p');
  element.textContent = text;
  
  if (isFinal) {
    element.classList.add('final');
    
    // Add timestamp
    const timestamp = document.createElement('small');
    timestamp.textContent = new Date().toLocaleTimeString();
    timestamp.classList.add('timestamp');
    element.appendChild(document.createElement('br'));
    element.appendChild(timestamp);
    
    // If we have an interim element with similar text, remove it
    if (currentInterimElement && 
        currentInterimElement.textContent.trim() === text.trim()) {
      transcriptContainer.removeChild(currentInterimElement);
      currentInterimElement = null;
    }
    
    // Add to history
    transcriptHistory.push({
      text,
      timestamp: new Date().toLocaleTimeString(),
      final: true
    });
  } else {
    element.classList.add('interim');
    
    // If we already have an interim element, replace it
    if (currentInterimElement) {
      transcriptContainer.removeChild(currentInterimElement);
    }
    
    currentInterimElement = element;
  }
  
  // Add to transcript container
  transcriptContainer.appendChild(element);
  
  // Limit history size
  if (transcriptHistory.length > MAX_HISTORY_LENGTH) {
    transcriptHistory.shift();
    
    // Also limit DOM elements (but keep more for context)
    while (transcriptContainer.childNodes.length > MAX_HISTORY_LENGTH * 1.5) {
      transcriptContainer.removeChild(transcriptContainer.firstChild);
    }
  }
  
  // Scroll to bottom
  transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
}

// Helper function to clear transcript
function clearTranscript() {
  const confirmClear = confirm("Are you sure you want to clear all transcriptions?");
  if (confirmClear) {
    transcriptContainer.innerHTML = '';
    transcriptHistory = [];
    currentInterimElement = null;
    
    // Add cleared message
    const clearedElement = document.createElement('p');
    clearedElement.textContent = 'Transcript cleared.';
    clearedElement.className = 'system-message';
    transcriptContainer.appendChild(clearedElement);
    
    // Reset retard meter
    updateRetardMeter(0, 'Waiting for new speech...', '');
  }
} 