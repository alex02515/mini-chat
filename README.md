# Private Messenger

A simple, beautiful private messenger with URL-based chat rooms for connecting with friends.

## Features

- ✨ Beautiful, modern chat interface
- 📱 Responsive design for both laptop and phone
- 💬 Real-time messaging via WebSocket
- 💾 Message history persistence
- 🎨 Smooth animations and transitions
- 🔄 Auto-reconnection
- 🔗 URL-based private chat rooms

## Setup

### For Development (Local)

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
http://localhost:8080?room=your-room-name
```

### For Production (Render)

The app is deployed on Render and automatically uses the public URL. The WebSocket connection automatically uses `wss://` when served over HTTPS.

## Usage

### Creating Chat Rooms

Each chat room has its own unique URL with a `?room=` parameter:

- `https://your-app.onrender.com?room=alex-and-friend1`
- `https://your-app.onrender.com?room=alex-and-friend2`
- `https://your-app.onrender.com?room=team-chat`

**Room names can only contain:**
- Letters (a-z, A-Z)
- Numbers (0-9)
- Dashes (-)
- Underscores (_)

### How to Invite Friends

1. **Create a unique room name** for your conversation (e.g., `alex-and-friend1`)

2. **Share the URL** with your friend:
   ```
   https://your-app.onrender.com?room=alex-and-friend1
   ```

3. **Your friend opens the link** and automatically joins that room

4. **Both of you can now chat** in real-time in that private room

### Features

- **Private Rooms**: Each `?room=` parameter creates a separate, isolated chat room
- **Real-time Updates**: Messages appear instantly on all devices in the same room
- **Message History**: All messages are saved and persist when you return
- **Cross-device Sync**: Open the same room URL on your laptop and phone to sync messages
- **No Login Required**: Just share the URL and start chatting

### Example Workflow

1. You want to chat with Friend A:
   - Create URL: `https://your-app.onrender.com?room=alex-and-friend1`
   - Share this URL with Friend A

2. Friend A opens the link:
   - They automatically join the `alex-and-friend1` room
   - They can immediately see message history and send messages

3. You both chat in real-time:
   - Messages appear instantly on both devices
   - Message history is saved automatically

4. For a different friend:
   - Create a new URL with a different room name: `?room=alex-and-friend2`
   - Each room is completely separate

### Tips

- Use descriptive room names (e.g., `alex-and-sarah`, `work-team`, `family-chat`)
- Room names are case-sensitive
- If you open the app without a `?room=` parameter, you'll see a message asking you to use a chat link
- Messages are stored per room, so each room maintains its own history

## How It Works

- Each device gets a unique ID stored in localStorage
- Messages are sent via WebSocket to the server
- The server stores messages per room and broadcasts only to clients in the same room
- Messages are saved both locally (localStorage) and on the server (messages.json)
- WebSocket automatically uses `wss://` (secure) when served over HTTPS, `ws://` when running locally

Enjoy your private messenger! 💬
