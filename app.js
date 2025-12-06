// Device identification
const deviceId = localStorage.getItem('deviceId') || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('deviceId', deviceId);

// Get room name from URL parameter
function getRoomFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    // Sanitize room name (alphanumeric, dash, underscore only)
    if (room) {
        return room.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50) || null;
    }
    return null;
}

// Get current room name (always reads from URL)
function getCurrentRoom() {
    return getRoomFromURL();
}

// WebSocket connection
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 3000;

// DOM elements
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const fileInput = document.getElementById('fileInput');
const attachButton = document.getElementById('attachButton');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const currentChatTitle = document.getElementById('currentChatTitle');

// Initialize send button as disabled
sendButton.disabled = true;

// Check if room parameter exists
const currentRoom = getCurrentRoom();
if (!currentRoom) {
    // Show placeholder message
    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div>
                <h1 style="font-size: 24px; margin-bottom: 16px; color: #333;">No Room Specified</h1>
                <p style="font-size: 16px; color: #666; max-width: 400px;">
                    Please open this app using a chat link with <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">?room=roomName</code>
                </p>
            </div>
        </div>
    `;
    throw new Error('No room parameter');
}

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

// File upload handler
attachButton.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file);
        // Reset input so same file can be selected again
        fileInput.value = '';
    }
});

// Handle file upload
function handleFileUpload(file) {
    // Check file size (limit to 10MB for videos, 5MB for images)
    const maxSize = file.type.startsWith('video/') ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
        alert(`File is too large. Maximum size: ${maxSize / (1024 * 1024)}MB`);
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const fileData = e.target.result;
        const fileType = file.type.startsWith('image/') ? 'image' : 'video';
        
        sendFileMessage(fileData, fileType, file.name);
    };
    
    reader.onerror = function() {
        alert('Error reading file. Please try again.');
    };
    
    // Read as data URL (base64)
    reader.readAsDataURL(file);
}

// Connect to WebSocket server
function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use window.location.origin and replace http/https with ws/wss
    const wsUrl = `${protocol}//${window.location.host}`;
    
    updateStatus('disconnected', 'Connecting...');
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            reconnectAttempts = 0;
            updateStatus('connected', 'Connected');
            
            // Re-enable send button if there's text
            if (messageInput.value.trim()) {
                sendButton.disabled = false;
            }
            
            // Send device identification with current room
            const roomName = getCurrentRoom();
            ws.send(JSON.stringify({
                type: 'register',
                deviceId: deviceId,
                roomName: roomName
            }));
            
            // Request message history for current room
            ws.send(JSON.stringify({
                type: 'getHistory',
                roomName: roomName
            }));
        };
        
        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            handleMessage(data);
        };
        
        ws.onerror = function(error) {
            // Don't update status on error - let onclose handle it
        };
        
        ws.onclose = function(event) {
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
        updateStatus('disconnected', 'Connection failed');
        
        // Show offline mode message
        if (chatMessages.children.length === 0) {
            showEmptyState();
        }
    }
}

// Handle incoming messages
function handleMessage(data) {
    const roomName = getCurrentRoom();
    
    if (data.type === 'message') {
        // Only show message if it's for the current room
        if (data.roomName === roomName) {
            const messageContent = data.messageType === 'text' 
                ? { type: 'text', content: data.message }
                : { type: data.messageType, content: data.fileData, fileName: data.fileName };
            
            addMessage(messageContent, data.deviceId !== deviceId);
            saveMessageToLocal(messageContent, data.deviceId !== deviceId, roomName);
        }
    } else if (data.type === 'history') {
        // Clear existing messages when history is received
        chatMessages.innerHTML = '';
        
        // Load message history
        if (data.messages && data.messages.length > 0) {
            data.messages.forEach(msg => {
                const messageContent = msg.messageType === 'text' || !msg.messageType
                    ? { type: 'text', content: msg.text || msg.message }
                    : { type: msg.messageType, content: msg.fileData, fileName: msg.fileName };
                
                addMessage(messageContent, msg.deviceId !== deviceId, false);
            });
        } else {
            // Try to load from localStorage
            loadMessagesFromLocal(roomName);
            if (chatMessages.children.length === 0) {
                showEmptyState();
            }
        }
    }
}

// Send text message
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    
    const roomName = getCurrentRoom();
    
    const message = {
        type: 'message',
        messageType: 'text',
        text: text,
        deviceId: deviceId,
        roomName: roomName,
        timestamp: Date.now()
    };
    
    // Send to server
    ws.send(JSON.stringify(message));
    
    // Add to UI immediately (optimistic update)
    addMessage({ type: 'text', content: text }, false);
    saveMessageToLocal({ type: 'text', content: text }, false, roomName);
    
    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendButton.disabled = true;
}

// Send file message
function sendFileMessage(fileData, fileType, fileName) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server. Please wait...');
        return;
    }
    
    const roomName = getCurrentRoom();
    
    const message = {
        type: 'message',
        messageType: fileType,
        fileData: fileData,
        fileName: fileName,
        deviceId: deviceId,
        roomName: roomName,
        timestamp: Date.now()
    };
    
    // Send to server
    ws.send(JSON.stringify(message));
    
    // Add to UI immediately (optimistic update)
    addMessage({ type: fileType, content: fileData, fileName: fileName }, false);
    saveMessageToLocal({ type: fileType, content: fileData, fileName: fileName }, false, roomName);
}

// Add message to chat
function addMessage(messageContent, isReceived, animate = true) {
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
    
    // Handle different message types
    if (messageContent.type === 'text') {
        bubble.textContent = messageContent.content;
    } else if (messageContent.type === 'image') {
        const img = document.createElement('img');
        img.src = messageContent.content;
        img.className = 'message-media';
        img.alt = messageContent.fileName || 'Image';
        img.loading = 'lazy';
        bubble.appendChild(img);
    } else if (messageContent.type === 'video') {
        const video = document.createElement('video');
        video.src = messageContent.content;
        video.className = 'message-media';
        video.controls = true;
        video.preload = 'metadata';
        bubble.appendChild(video);
    }
    
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatTime(new Date());
    
    messageDiv.appendChild(bubble);
    messageDiv.appendChild(time);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom immediately
    requestAnimationFrame(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
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

// Save message to localStorage (per room)
function saveMessageToLocal(messageContent, isReceived, roomName) {
    const storageKey = `messages_${roomName}`;
    const messages = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    const messageToSave = {
        type: messageContent.type,
        deviceId: isReceived ? 'other' : deviceId,
        timestamp: Date.now()
    };
    
    if (messageContent.type === 'text') {
        messageToSave.text = messageContent.content;
    } else {
        messageToSave.fileData = messageContent.content;
        messageToSave.fileName = messageContent.fileName;
    }
    
    messages.push(messageToSave);
    
    // Keep only last 100 messages per room
    if (messages.length > 100) {
        messages.shift();
    }
    
    localStorage.setItem(storageKey, JSON.stringify(messages));
}

// Load messages from localStorage (per room)
function loadMessagesFromLocal(roomName) {
    const storageKey = `messages_${roomName}`;
    const messages = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (messages.length > 0) {
        messages.forEach(msg => {
            const messageContent = msg.type === 'text' || !msg.type
                ? { type: 'text', content: msg.text }
                : { type: msg.type, content: msg.fileData, fileName: msg.fileName };
            
            addMessage(messageContent, msg.deviceId !== deviceId, false);
        });
    } else {
        showEmptyState();
    }
}

// Update header to show room name
function updateRoomDisplay() {
    const roomName = getCurrentRoom();
    if (currentChatTitle && roomName) {
        currentChatTitle.textContent = roomName;
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

// Update room display
updateRoomDisplay();

// Initialize connection status
updateStatus('disconnected', 'Connecting...');

// Initialize
connect();

// Show empty state initially if no messages
setTimeout(() => {
    if (chatMessages.children.length === 0) {
        const roomName = getCurrentRoom();
        loadMessagesFromLocal(roomName);
        if (chatMessages.children.length === 0) {
            showEmptyState();
        }
    }
}, 500);

