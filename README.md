# Retard Meter

A macOS Electron app that captures system audio and provides real-time speech transcription.

## Features

- Real-time audio capture from system or microphone
- Speech-to-text conversion using Deepgram's powerful AI transcription
- Live speech recognition with low latency
- Device selection for capturing from different audio sources
- Beautiful, easy-to-use interface with dark mode support
- Transcript history with timestamps

## Prerequisites

Before you can run this app, you'll need to:

1. Install Node.js and npm
2. Install SoX for audio capture:
   ```
   brew install sox
   ```
3. Set up a Deepgram API key:
   - Create a free account at [deepgram.com](https://deepgram.com)
   - Create a new project and generate an API key
   - Add your API key to the `.env` file or environment variables

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/retard-meter.git
   cd retard-meter
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Run the setup script to check dependencies:
   ```
   npm run setup
   ```

4. Start the app:
   ```
   npm start
   ```

## Capturing System Audio on macOS

This app can capture audio from your microphone by default. To capture system audio (everything playing on your computer), you'll need to:

1. Install BlackHole to create a virtual audio device:
   ```
   brew install blackhole-2ch
   ```

2. Set up audio routing in Audio MIDI Setup:
   - Open Audio MIDI Setup (found in /Applications/Utilities)
   - Click the "+" button in the bottom left and select "Create Multi-Output Device"
   - Check both your regular output device (e.g., Built-in Output) and "BlackHole 2ch"
   - Set the Multi-Output Device as your default output in System Preferences > Sound
   - In the Retard Meter app, select "BlackHole 2ch" from the device dropdown

## Using the App

1. Launch the app using `npm start`
2. Select your audio input device from the dropdown menu
3. Click "Start Recording" to begin capturing and transcribing audio
4. The transcript will update in real-time
5. Click "Stop Recording" when finished

## Building the App

To build the app for distribution:

```
npm run build
```

This will create distributable files in the `dist` directory.

## Troubleshooting

- **No audio devices detected**: Make sure you've granted microphone permissions to the app
- **"SoX not found" error**: Make sure Sox is installed with `brew install sox`
- **"Error initializing Deepgram API"**: Check your Deepgram API key setup in the .env file
- **No system audio**: Make sure BlackHole is installed and your Multi-Output Device is configured correctly

## License

MIT

## Acknowledgements

- [Electron](https://www.electronjs.org/)
- [Deepgram](https://deepgram.com) for speech recognition API
- [node-audiorecorder](https://github.com/RedKenrok/node-audiorecorder)
- [BlackHole](https://github.com/ExistentialAudio/BlackHole) for system audio capture 