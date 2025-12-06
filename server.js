const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Message storage file
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Load messages from file (per room)
function loadMessages() {
    try {
        if (fs.existsSync(MESSAGES_FILE)) {
            const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
            const parsed = JSON.parse(data);
            // Support both old format (array) and new format (object with rooms)
            if (Array.isArray(parsed)) {
                // Migrate old format to new format
                return { 'default': parsed };
            }
            return parsed;
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
    return {};
}

// Save messages to file
function saveMessages(messagesByRoom) {
    try {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messagesByRoom, null, 2));
    } catch (error) {
        console.error('Error saving messages:', error);
    }
}

// Initialize messages storage (per room)
let messagesByRoom = loadMessages();

// Clean up old messages (keep only last 200 per room)
Object.keys(messagesByRoom).forEach(roomName => {
    if (messagesByRoom[roomName].length > 200) {
        messagesByRoom[roomName] = messagesByRoom[roomName].slice(-200);
    }
});
saveMessages(messagesByRoom);

// Create HTTP server to serve static files
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`, 'utf-8');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients: Map<deviceId, {ws, currentRoom}>
const clients = new Map();

wss.on('connection', (ws, req) => {
    let deviceId = null;
    let currentRoom = 'default';

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());

            if (message.type === 'register') {
                deviceId = message.deviceId;
                currentRoom = message.roomName || 'default';
                clients.set(deviceId, { ws, currentRoom });
                console.log(`Device connected: ${deviceId} to room: ${currentRoom}`);
            } else if (message.type === 'joinRoom') {
                // Client wants to switch rooms
                const oldRoom = currentRoom;
                currentRoom = message.roomName || 'default';
                if (clients.has(deviceId)) {
                    clients.get(deviceId).currentRoom = currentRoom;
                }
                console.log(`Device ${deviceId} switched from ${oldRoom} to ${currentRoom}`);
                
                // Send message history for the new room
                const roomMessages = messagesByRoom[currentRoom] || [];
                ws.send(JSON.stringify({
                    type: 'history',
                    roomName: currentRoom,
                    messages: roomMessages.slice(-50) // Send last 50 messages
                }));
            } else if (message.type === 'getHistory') {
                // Send message history for current room
                const roomName = message.roomName || currentRoom;
                const roomMessages = messagesByRoom[roomName] || [];
                ws.send(JSON.stringify({
                    type: 'history',
                    roomName: roomName,
                    messages: roomMessages.slice(-50) // Send last 50 messages
                }));
            } else if (message.type === 'message') {
                // Save message to the room
                const roomName = message.roomName || currentRoom;
                
                // Initialize room if it doesn't exist
                if (!messagesByRoom[roomName]) {
                    messagesByRoom[roomName] = [];
                }
                
                const messageData = {
                    text: message.text,
                    deviceId: message.deviceId,
                    timestamp: message.timestamp || Date.now()
                };
                
                messagesByRoom[roomName].push(messageData);
                
                // Keep only last 200 messages per room
                if (messagesByRoom[roomName].length > 200) {
                    messagesByRoom[roomName] = messagesByRoom[roomName].slice(-200);
                }
                
                // Save to file
                saveMessages(messagesByRoom);

                // Broadcast to all other clients in the same room
                clients.forEach((client, id) => {
                    if (id !== deviceId && 
                        client.currentRoom === roomName && 
                        client.ws.readyState === WebSocket.OPEN) {
                        client.ws.send(JSON.stringify({
                            type: 'message',
                            message: messageData.text,
                            deviceId: message.deviceId,
                            roomName: roomName
                        }));
                    }
                });

                console.log(`Message from ${message.deviceId} in room ${roomName}: ${message.text}`);
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });

    ws.on('close', () => {
        if (deviceId) {
            clients.delete(deviceId);
            console.log(`Device disconnected: ${deviceId}`);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`\n🚀 Private Messenger Server running on:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`\n📱 Open this URL on both your laptop and phone!\n`);
});




