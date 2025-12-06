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

// Initialize send button as disabled
sendButton.disabled = true;

// Auto-resize textarea
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Ensure input is visible when focused on mobile
messageInput.addEventListener('focus', function() {
    if (window.innerWidth <= 768) {
        // Small delay to let keyboard appear
        setTimeout(() => {
            const inputContainer = document.querySelector('.chat-input-container');
            if (inputContainer) {
                inputContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        }, 300);
    }
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
    // On Render, use the same hostname and port (Render handles routing)
    // For localhost, use the port
    let wsUrl;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const port = window.location.port || '8080';
        wsUrl = `${protocol}//${window.location.hostname}:${port}`;
    } else {
        // Production (Render) - use same hostname and port as HTTP
        // Render routes WebSocket upgrades through the same port
        const host = window.location.host; // This includes port if present
        wsUrl = `${protocol}//${host}`;
    }
    
    console.log('Connecting to WebSocket:', wsUrl);
    updateStatus('disconnected', 'Connecting...');
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            console.log('Connected to server');
            reconnectAttempts = 0;
            updateStatus('connected', 'Connected');
            
            // Re-enable send button if there's text
            if (messageInput.value.trim()) {
                sendButton.disabled = false;
            }
            
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
            // Don't update status on error - let onclose handle it
            // This prevents showing "Disconnected" prematurely
        };
        
        ws.onclose = function(event) {
            console.log('Disconnected from server', event.code, event.reason);
            // Only show disconnected if it wasn't a clean close or we've exhausted reconnects
            if (reconnectAttempts >= maxReconnectAttempts) {
                updateStatus('disconnected', 'Connection failed. Please refresh.');
            } else {
                updateStatus('disconnected', 'Reconnecting...');
            }
            ws = null;
            
            // Attempt to reconnect
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                setTimeout(connect, reconnectDelay);
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
    const hasText = this.value.trim().length > 0;
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    sendButton.disabled = !hasText || !isConnected;
    
    // If not connected, show that we're waiting
    if (!isConnected && hasText) {
        sendButton.title = 'Waiting for connection...';
    } else {
        sendButton.title = '';
    }
});

// Mobile viewport fix for iOS Safari
function setMobileViewportHeight() {
    if (window.innerWidth <= 768) {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        
        // Also set the chat container height
        const chatContainer = document.querySelector('.chat-container');
        if (chatContainer) {
            chatContainer.style.height = `${window.innerHeight}px`;
        }
    }
}

// Set initial viewport height
setMobileViewportHeight();

// Update on resize (handles Safari address bar show/hide)
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setMobileViewportHeight, 100);
});

// Update on orientation change
window.addEventListener('orientationchange', () => {
    setTimeout(setMobileViewportHeight, 500);
});

// Prevent iOS bounce scrolling on body (only when not in messages area)
document.body.addEventListener('touchmove', (e) => {
    // Allow scrolling in messages area and input
    if (e.target.closest('.chat-messages') || 
        e.target.closest('.chat-input-container') ||
        e.target.closest('#messageInput')) {
        return;
    }
    // Prevent bounce scrolling on body
    if (document.body.scrollTop === 0 || 
        document.body.scrollTop + document.body.clientHeight >= document.body.scrollHeight) {
        e.preventDefault();
    }
}, { passive: false });

// Initialize connection status
updateStatus('disconnected', 'Connecting...');

// Initialize
connect();

// Show empty state initially if no messages
setTimeout(() => {
    if (chatMessages.children.length === 0) {
        loadMessagesFromLocal();
        if (chatMessages.children.length === 0) {
            showEmptyState();
        }
    }
}, 500);

