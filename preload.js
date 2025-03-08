const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Send messages to main process
    send: (channel, data) => {
      // Whitelist channels
      const validChannels = ['toggle-recording', 'select-device', 'show-audio-setup'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    
    // Receive messages from main process
    receive: (channel, func) => {
      const validChannels = ['transcription', 'recording-status', 'available-devices', 'retard-meter'];
      if (validChannels.includes(channel)) {
        // Remove any existing listeners to avoid duplicates
        ipcRenderer.removeAllListeners(channel);
        // Deliberately strip event as it includes `sender`
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    
    // Remove all listeners for a channel
    removeAllListeners: (channel) => {
      const validChannels = ['transcription', 'recording-status', 'available-devices', 'retard-meter'];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel);
      }
    },
    
    // Log to console (for debugging)
    log: (message) => {
      console.log(`[API]: ${message}`);
    }
  }
); 