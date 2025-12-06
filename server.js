const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Message storage file
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Load messages from file
function loadMessages() {
    try {
        if (fs.existsSync(MESSAGES_FILE)) {
            const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
    return [];
}

// Save messages to file
function saveMessages(messages) {
    try {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    } catch (error) {
        console.error('Error saving messages:', error);
    }
}

// Initialize messages array
let messages = loadMessages();

// Keep only last 200 messages in memory
if (messages.length > 200) {
    messages = messages.slice(-200);
    saveMessages(messages);
}

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

// Store connected clients
const clients = new Map();

wss.on('connection', (ws, req) => {
    let deviceId = null;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());

            if (message.type === 'register') {
                deviceId = message.deviceId;
                clients.set(deviceId, ws);
                console.log(`Device connected: ${deviceId}`);
            } else if (message.type === 'getHistory') {
                // Send message history
                ws.send(JSON.stringify({
                    type: 'history',
                    messages: messages.slice(-50) // Send last 50 messages
                }));
            } else if (message.type === 'message') {
                // Save message
                const messageData = {
                    text: message.text,
                    deviceId: message.deviceId,
                    timestamp: message.timestamp || Date.now()
                };
                
                messages.push(messageData);
                
                // Keep only last 200 messages
                if (messages.length > 200) {
                    messages = messages.slice(-200);
                }
                
                // Save to file
                saveMessages(messages);

                // Broadcast to all other clients
                clients.forEach((client, id) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'message',
                            message: messageData.text,
                            deviceId: message.deviceId
                        }));
                    }
                });

                console.log(`Message from ${message.deviceId}: ${message.text}`);
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

