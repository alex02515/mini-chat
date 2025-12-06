# Private Messenger

A simple, beautiful private messenger that connects your laptop and phone.

## Features

- ✨ Beautiful, modern chat interface
- 📱 Responsive design for both laptop and phone
- 💬 Real-time messaging via WebSocket
- 💾 Message history persistence
- 🎨 Smooth animations and transitions
- 🔄 Auto-reconnection

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:8080
```

4. Open the same URL on your phone (make sure both devices are on the same network, or use your computer's IP address like `http://192.168.1.X:8080`)

## Usage

- Type a message and press Enter or click the send button
- Messages appear in real-time on both devices
- Message history is saved and will appear when you reopen the app
- The status indicator shows your connection status

## How It Works

- Each device gets a unique ID stored in localStorage
- Messages are sent via WebSocket to the server
- The server broadcasts messages to all connected devices
- Messages are saved both locally (localStorage) and on the server (messages.json)

Enjoy your private messenger! 💬

