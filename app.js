// Device identification
const deviceId = localStorage.getItem('deviceId') || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('deviceId', deviceId);

// WebSocket connection
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 3000;

// DOM elements
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// Auto-resize textarea
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Send message on Enter (Shift+Enter for new line)
messageInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Send button click
sendButton.addEventListener('click', sendMessage);

// Connect to WebSocket server
function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use the same port as the HTTP server (8080) or current port if different
    const port = window.location.port || '8080';
    const wsUrl = `${protocol}//${window.location.hostname}:${port}`;
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            console.log('Connected to server');
            reconnectAttempts = 0;
            updateStatus('connected', 'Connected');
            
            // Send device identification
            ws.send(JSON.stringify({
                type: 'register',
                deviceId: deviceId
            }));
            
            // Request message history
            ws.send(JSON.stringify({
                type: 'getHistory'
            }));
        };
        
        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            handleMessage(data);
        };
        
        ws.onerror = function(error) {
            console.error('WebSocket error:', error);
            updateStatus('disconnected', 'Connection error');
        };
        
        ws.onclose = function() {
            console.log('Disconnected from server');
            updateStatus('disconnected', 'Disconnected');
            ws = null;
            
            // Attempt to reconnect
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                setTimeout(connect, reconnectDelay);
            } else {
                statusText.textContent = 'Connection failed. Please refresh.';
            }
        };
    } catch (error) {
        console.error('Failed to connect:', error);
        updateStatus('disconnected', 'Connection failed');
        
        // Show offline mode message
        if (chatMessages.children.length === 0) {
            showEmptyState();
        }
    }
}

// Handle incoming messages
function handleMessage(data) {
    if (data.type === 'message') {
        addMessage(data.message, data.deviceId !== deviceId);
        saveMessageToLocal(data.message, data.deviceId !== deviceId);
    } else if (data.type === 'history') {
        // Load message history
        if (data.messages && data.messages.length > 0) {
            data.messages.forEach(msg => {
                addMessage(msg.text, msg.deviceId !== deviceId, false);
            });
        } else {
            // Try to load from localStorage
            loadMessagesFromLocal();
        }
    }
}

// Send message
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    
    const message = {
        type: 'message',
        text: text,
        deviceId: deviceId,
        timestamp: Date.now()
    };
    
    // Send to server
    ws.send(JSON.stringify(message));
    
    // Add to UI immediately (optimistic update)
    addMessage(text, false);
    saveMessageToLocal(text, false);
    
    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendButton.disabled = true;
}

// Add message to chat
function addMessage(text, isReceived, animate = true) {
    // Remove empty state if present
    const emptyState = chatMessages.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isReceived ? 'received' : 'sent'}`;
    if (!animate) {
        messageDiv.style.animation = 'none';
    }
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatTime(new Date());
    
    messageDiv.appendChild(bubble);
    messageDiv.appendChild(time);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Format time
function formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Update connection status
function updateStatus(status, text) {
    statusDot.className = `status-dot ${status}`;
    statusText.textContent = text;
}

// Save message to localStorage
function saveMessageToLocal(text, isReceived) {
    const messages = JSON.parse(localStorage.getItem('messages') || '[]');
    messages.push({
        text: text,
        deviceId: isReceived ? 'other' : deviceId,
        timestamp: Date.now()
    });
    
    // Keep only last 100 messages
    if (messages.length > 100) {
        messages.shift();
    }
    
    localStorage.setItem('messages', JSON.stringify(messages));
}

// Load messages from localStorage
function loadMessagesFromLocal() {
    const messages = JSON.parse(localStorage.getItem('messages') || '[]');
    if (messages.length > 0) {
        messages.forEach(msg => {
            addMessage(msg.text, msg.deviceId !== deviceId, false);
        });
    } else {
        showEmptyState();
    }
}

// Show empty state
function showEmptyState() {
    if (chatMessages.querySelector('.empty-state')) return;
    
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
        <div class="empty-state-icon">💬</div>
        <div class="empty-state-text">No messages yet.<br>Start a conversation!</div>
    `;
    chatMessages.appendChild(emptyState);
}

// Enable/disable send button based on input
messageInput.addEventListener('input', function() {
    sendButton.disabled = !this.value.trim() || !ws || ws.readyState !== WebSocket.OPEN;
});

// Initialize
connect();

// Show empty state initially if no messages
if (chatMessages.children.length === 0) {
    setTimeout(() => {
        if (chatMessages.children.length === 0) {
            showEmptyState();
        }
    }, 1000);
}

