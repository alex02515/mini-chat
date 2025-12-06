// Device identification
const deviceId = localStorage.getItem('deviceId') || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('deviceId', deviceId);

// Chat/Room management
let currentRoom = 'Chat 1';
let chatList = [];

// Load chat list from localStorage
function loadChatList() {
    const saved = localStorage.getItem('chatList');
    if (saved) {
        chatList = JSON.parse(saved);
    } else {
        // Initialize with default chats
        chatList = ['Chat 1', 'Chat 2', 'Chat 3'];
        saveChatList();
    }
    
    // Load current room from localStorage
    const savedRoom = localStorage.getItem('currentRoom');
    if (savedRoom && chatList.includes(savedRoom)) {
        currentRoom = savedRoom;
    }
}

function saveChatList() {
    localStorage.setItem('chatList', JSON.stringify(chatList));
}

function addChat(chatName) {
    if (!chatList.includes(chatName)) {
        chatList.push(chatName);
        saveChatList();
        renderChatList();
    }
}

function removeChat(chatName) {
    if (chatList.length <= 1) {
        alert('You must have at least one chat!');
        return;
    }
    if (chatName === currentRoom) {
        // Switch to first available chat
        const otherChats = chatList.filter(c => c !== chatName);
        if (otherChats.length > 0) {
            switchToChat(otherChats[0]);
        }
    }
    chatList = chatList.filter(c => c !== chatName);
    saveChatList();
    renderChatList();
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
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const chatListContainer = document.getElementById('chatListContainer');
const chatListElement = document.getElementById('chatList');
const newChatButton = document.getElementById('newChatButton');
const currentChatTitle = document.getElementById('currentChatTitle');

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
            
            // Send device identification with current room
            ws.send(JSON.stringify({
                type: 'register',
                deviceId: deviceId,
                roomName: currentRoom
            }));
            
            // Request message history for current room
            ws.send(JSON.stringify({
                type: 'getHistory',
                roomName: currentRoom
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
        // Only show message if it's for the current room
        if (data.roomName === currentRoom) {
            addMessage(data.message, data.deviceId !== deviceId);
            saveMessageToLocal(data.message, data.deviceId !== deviceId, currentRoom);
        }
    } else if (data.type === 'history') {
        // Clear existing messages when history is received
        chatMessages.innerHTML = '';
        
        // Load message history
        if (data.messages && data.messages.length > 0) {
            data.messages.forEach(msg => {
                addMessage(msg.text, msg.deviceId !== deviceId, false);
            });
        } else {
            // Try to load from localStorage
            loadMessagesFromLocal(currentRoom);
            if (chatMessages.children.length === 0) {
                showEmptyState();
            }
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
        roomName: currentRoom,
        timestamp: Date.now()
    };
    
    // Send to server
    ws.send(JSON.stringify(message));
    
    // Add to UI immediately (optimistic update)
    addMessage(text, false);
    saveMessageToLocal(text, false, currentRoom);
    
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

// Save message to localStorage (per room)
function saveMessageToLocal(text, isReceived, roomName) {
    const storageKey = `messages_${roomName}`;
    const messages = JSON.parse(localStorage.getItem(storageKey) || '[]');
    messages.push({
        text: text,
        deviceId: isReceived ? 'other' : deviceId,
        timestamp: Date.now()
    });
    
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
            addMessage(msg.text, msg.deviceId !== deviceId, false);
        });
    } else {
        showEmptyState();
    }
}

// Switch to a different chat
function switchToChat(roomName) {
    if (roomName === currentRoom) return;
    
    // Save current room
    localStorage.setItem('currentRoom', roomName);
    
    // Update current room
    currentRoom = roomName;
    
    // Update UI
    currentChatTitle.textContent = roomName;
    chatMessages.innerHTML = '';
    
    // Update chat list highlighting
    renderChatList();
    
    // Join the new room on server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'joinRoom',
            roomName: roomName
        }));
    } else {
        // If not connected, load from localStorage
        loadMessagesFromLocal(roomName);
        if (chatMessages.children.length === 0) {
            showEmptyState();
        }
    }
}

// Render chat list
function renderChatList() {
    chatListElement.innerHTML = '';
    
    chatList.forEach(chatName => {
        const chatItem = document.createElement('div');
        chatItem.className = `chat-item ${chatName === currentRoom ? 'active' : ''}`;
        chatItem.innerHTML = `
            <span class="chat-item-name">${chatName}</span>
            ${chatList.length > 1 ? '<button class="chat-item-delete" aria-label="Delete chat">×</button>' : ''}
        `;
        
        chatItem.addEventListener('click', (e) => {
            if (!e.target.classList.contains('chat-item-delete')) {
                switchToChat(chatName);
            }
        });
        
        const deleteBtn = chatItem.querySelector('.chat-item-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${chatName}"?`)) {
                    removeChat(chatName);
                }
            });
        }
        
        chatListElement.appendChild(chatItem);
    });
}

// Handle new chat button
newChatButton.addEventListener('click', () => {
    const chatNumber = chatList.length + 1;
    let newChatName = `Chat ${chatNumber}`;
    
    // Make sure name is unique
    let counter = 1;
    while (chatList.includes(newChatName)) {
        newChatName = `Chat ${chatNumber + counter}`;
        counter++;
    }
    
    addChat(newChatName);
    switchToChat(newChatName);
});

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

// Initialize chat list
loadChatList();
renderChatList();

// Set initial chat title
currentChatTitle.textContent = currentRoom;

// Initialize connection status
updateStatus('disconnected', 'Connecting...');

// Initialize
connect();

// Show empty state initially if no messages
setTimeout(() => {
    if (chatMessages.children.length === 0) {
        loadMessagesFromLocal(currentRoom);
        if (chatMessages.children.length === 0) {
            showEmptyState();
        }
    }
}, 500);

