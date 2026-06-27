/**
 * MontrAI Chatbot Widget SDK
 * Embeddable JavaScript SDK for website chatbot integration
 */

(function () {
    'use strict';

    // Configuration
    let config = {
        baseUrl: '',
        widgetToken: '',
        visitorId: '',          // optional: stable visitor ID for cross-device session continuity
        position: 'bottom-right',
        primaryColor: '#3B82F6',
        greeting: 'Hi! How can I help you today?',
        placeholder: 'Type your message...',
        showLauncher: true,
    };

    // State
    let isOpen = false;
    let isInitialized = false;
    let pendingInit = false;
    let sessionId = null;
    let socket = null;
    let messages = [];
    let isHandedOff = false;    // true after agent handoff triggered

    // DOM Elements
    let widgetContainer = null;
    let launcher = null;
    let chatWindow = null;

    /**
     * Initialize the chatbot widget
     */
    function init(userConfig) {
        if (userConfig) {
            config = { ...config, ...userConfig };
        }

        if (!config.baseUrl || !config.widgetToken) {
            console.error('[MontrAI] Missing required configuration: baseUrl and widgetToken');
            return;
        }

        if (isInitialized) {
            return;
        }

        if (!document.body) {
            scheduleInit();
            return;
        }

        isInitialized = true;

        // Generate local session ID first (used as fallback if validate fails)
        sessionId = generateSessionId();

        // Validate with server, apply config overrides, then build widget
        validateAndInit();
    }

    /**
     * Wait for the page body before mounting the widget.
     */
    function scheduleInit() {
        if (pendingInit) {
            return;
        }

        pendingInit = true;
        document.addEventListener('DOMContentLoaded', () => {
            pendingInit = false;
            init();
        }, { once: true });
    }

    /**
     * Call validate endpoint to get server config + cross-device session, then build widget.
     */
    async function validateAndInit() {
        try {
            const body = { widgetToken: config.widgetToken };
            if (config.visitorId) body.visitorId = config.visitorId;

            const res = await fetch(`${config.baseUrl}/api/chatbot/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                const data = await res.json();

                // Apply server-side config overrides (bot name, colors, etc.)
                if (data.config) {
                    if (data.config.greeting)       config.greeting    = data.config.greeting;
                    if (data.config.placeholder)    config.placeholder = data.config.placeholder;
                    if (data.config.primaryColor)   config.primaryColor = data.config.primaryColor;
                    if (data.config.widgetPosition) config.position    = data.config.widgetPosition;
                }

                // Cross-device continuity: use the prior open session if found
                if (data.session && data.session.priorSessionId) {
                    sessionId = data.session.priorSessionId;
                    localStorage.setItem('montrai_session_id', sessionId);
                }

                createWidget();
                connectWebSocket();

                // Restore server-side history when visitorId is provided
                if (data.session && data.session.priorHistory && data.session.priorHistory.length) {
                    const container = document.getElementById('montrai-messages');
                    if (container) container.innerHTML = '';
                    messages = [];
                    data.session.priorHistory.forEach(function (msg) {
                        addMessage(msg.role === 'user' ? 'user' : 'bot', msg.content);
                    });
                } else {
                    loadChatHistory();
                }
                return;
            }
        } catch (_) {
            // Server unreachable or domain not authorized — fall through to local init
        }

        // Fallback: build widget with local config, restore localStorage history
        createWidget();
        connectWebSocket();
        loadChatHistory();
    }

    /**
     * Generate unique session ID
     */
    function generateSessionId() {
        const stored = localStorage.getItem('montrai_session_id');
        if (stored) return stored;

        const newId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('montrai_session_id', newId);
        return newId;
    }

    /**
     * Create widget DOM elements
     */
    function createWidget() {
        // Create container
        widgetContainer = document.createElement('div');
        widgetContainer.id = 'montrai-widget';
        widgetContainer.style.cssText = `
      position: fixed;
      ${config.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
      bottom: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

        // Create launcher button
        if (config.showLauncher) {
            launcher = document.createElement('button');
            launcher.id = 'montrai-launcher';
            launcher.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      `;
            launcher.style.cssText = `
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background-color: ${config.primaryColor};
        color: white;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s;
      `;
            launcher.onclick = toggleChat;
            widgetContainer.appendChild(launcher);
        }

        // Create chat window
        chatWindow = document.createElement('div');
        chatWindow.id = 'montrai-chat-window';
        chatWindow.style.cssText = `
      width: 380px;
      height: 600px;
      max-height: 90vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
      margin-bottom: 20px;
    `;

        chatWindow.innerHTML = `
      <div id="montrai-header" style="
        background-color: ${config.primaryColor};
        color: white;
        padding: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      ">
        <div>
          <div style="font-weight: 600; font-size: 16px;">Chat Support</div>
          <div style="font-size: 12px; opacity: 0.9;" id="montrai-status-line">We typically reply in minutes</div>
        </div>
        <button id="montrai-close" style="
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 24px;
          line-height: 1;
        ">×</button>
      </div>
      <div id="montrai-messages" style="
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        background: #f9fafb;
      "></div>
      <div id="montrai-input-container" style="
        padding: 16px;
        border-top: 1px solid #e5e7eb;
        background: white;
      ">
        <div style="display: flex; gap: 8px;">
          <input
            type="text"
            id="montrai-input"
            placeholder="${config.placeholder}"
            style="
              flex: 1;
              padding: 10px 12px;
              border: 1px solid #d1d5db;
              border-radius: 8px;
              font-size: 14px;
              outline: none;
            "
          />
          <button id="montrai-send" style="
            background-color: ${config.primaryColor};
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 16px;
            cursor: pointer;
            font-weight: 500;
          ">Send</button>
        </div>
      </div>
    `;

        widgetContainer.appendChild(chatWindow);
        document.body.appendChild(widgetContainer);

        // Event listeners
        document.getElementById('montrai-close').onclick = toggleChat;
        document.getElementById('montrai-send').onclick = sendMessage;
        document.getElementById('montrai-input').onkeypress = (e) => {
            if (e.key === 'Enter') sendMessage();
        };

        // Show greeting message
        if (config.greeting) {
            addMessage('bot', config.greeting);
        }
    }

    /**
     * Toggle chat window
     */
    function toggleChat() {
        isOpen = !isOpen;
        chatWindow.style.display = isOpen ? 'flex' : 'none';
        if (launcher) {
            launcher.style.transform = isOpen ? 'scale(0.9)' : 'scale(1)';
        }
    }

    /**
     * Connect to WebSocket
     */
    function connectWebSocket() {
        try {
            socket = io(config.baseUrl, {
                path: '/api/socket',
                transports: ['websocket', 'polling'],
            });

            socket.on('connect', () => {
                console.log('[MontrAI] WebSocket connected');
                socket.emit('chatbot:join', { sessionId, widgetToken: config.widgetToken });
            });

            socket.on('chatbot:message', (data) => {
                addMessage('bot', data.content);
                if (data.quickReplies && data.quickReplies.length) {
                    renderQuickReplies(data.quickReplies);
                }
                if (data.handoff) {
                    handleHandoff();
                }
            });

            socket.on('chatbot:error', (data) => {
                console.error('[MontrAI] Chatbot socket error:', data?.message);
                addMessage('bot', 'Sorry, I encountered an error. Please try again.');
            });

            socket.on('disconnect', () => {
                console.log('[MontrAI] WebSocket disconnected');
            });
        } catch (error) {
            console.error('[MontrAI] WebSocket connection failed:', error);
        }
    }

    /**
     * Send message
     */
    function sendMessage() {
        const input = document.getElementById('montrai-input');
        const content = input.value.trim();

        if (!content) return;

        // Remove any existing quick-reply chips before sending
        removeQuickReplies();

        // Add user message to UI
        addMessage('user', content);
        input.value = '';

        // Send to server
        if (socket && socket.connected) {
            socket.emit('chatbot:message', {
                sessionId,
                widgetToken: config.widgetToken,
                content,
                visitorId: config.visitorId || undefined,
            });
        } else {
            // Fallback to HTTP if WebSocket not available
            sendMessageHTTP(content);
        }

        // Save to history
        saveChatHistory();
    }

    /**
     * Send message via HTTP (fallback)
     */
    async function sendMessageHTTP(content) {
        // Show typing indicator
        const typingId = showTypingIndicator();

        try {
            const body = {
                widgetToken: config.widgetToken,
                sessionId,
                content,
            };
            if (config.visitorId) body.visitorId = config.visitorId;

            const response = await fetch(`${config.baseUrl}/api/chatbot/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            removeTypingIndicator(typingId);

            const data = await response.json();

            if (response.status === 429) {
                addMessage('bot', data.error || 'Too many messages. Please wait a moment.');
                return;
            }

            if (data.reply) {
                addMessage('bot', data.reply);
            }

            if (data.quickReplies && data.quickReplies.length) {
                renderQuickReplies(data.quickReplies);
            }

            if (data.handoff) {
                handleHandoff();
            }
        } catch (error) {
            removeTypingIndicator(typingId);
            console.error('[MontrAI] Failed to send message:', error);
            addMessage('bot', 'Sorry, I encountered an error. Please try again.');
        }
    }

    /**
     * Show a typing indicator bubble; returns a unique id to remove it later.
     */
    function showTypingIndicator() {
        const container = document.getElementById('montrai-messages');
        const id = 'typing_' + Date.now();
        const el = document.createElement('div');
        el.id = id;
        el.style.cssText = 'margin-bottom: 12px; display: flex; justify-content: flex-start;';
        el.innerHTML = `
      <div style="
        max-width: 70%;
        padding: 10px 14px;
        border-radius: 12px;
        background-color: white;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        font-size: 20px;
        letter-spacing: 2px;
        color: #9ca3af;
      ">...</div>
    `;
        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
        return id;
    }

    /**
     * Remove typing indicator by id.
     */
    function removeTypingIndicator(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    /**
     * Render quick-reply chip buttons below the last bot message.
     */
    function renderQuickReplies(replies) {
        const container = document.getElementById('montrai-messages');
        const chipsDiv = document.createElement('div');
        chipsDiv.id = 'montrai-quick-replies';
        chipsDiv.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
      padding-left: 4px;
    `;

        replies.forEach(function (reply) {
            const btn = document.createElement('button');
            btn.textContent = reply.label;
            btn.style.cssText = `
        padding: 6px 14px;
        border-radius: 16px;
        border: 1.5px solid ${config.primaryColor};
        background: white;
        color: ${config.primaryColor};
        font-size: 13px;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
        font-family: inherit;
      `;
            btn.onmouseenter = function () {
                btn.style.background = config.primaryColor;
                btn.style.color = 'white';
            };
            btn.onmouseleave = function () {
                btn.style.background = 'white';
                btn.style.color = config.primaryColor;
            };
            btn.onclick = function () {
                removeQuickReplies();
                document.getElementById('montrai-input').value = reply.value;
                sendMessage();
            };
            chipsDiv.appendChild(btn);
        });

        container.appendChild(chipsDiv);
        container.scrollTop = container.scrollHeight;
    }

    /**
     * Remove quick-reply chips if they exist.
     */
    function removeQuickReplies() {
        const el = document.getElementById('montrai-quick-replies');
        if (el) el.remove();
    }

    /**
     * Handle agent handoff — update status line, disable input.
     */
    function handleHandoff() {
        if (isHandedOff) return;
        isHandedOff = true;

        const statusLine = document.getElementById('montrai-status-line');
        if (statusLine) {
            statusLine.textContent = 'Connected to a human agent';
            statusLine.style.opacity = '1';
        }

        // Visually indicate the input is waiting for an agent reply
        const input = document.getElementById('montrai-input');
        if (input) {
            input.placeholder = 'Waiting for an agent...';
        }
    }

    /**
     * Add message to chat
     */
    function addMessage(sender, content) {
        const messagesContainer = document.getElementById('montrai-messages');
        const messageDiv = document.createElement('div');

        const isBot = sender === 'bot';
        messageDiv.style.cssText = `
      margin-bottom: 12px;
      display: flex;
      ${isBot ? 'justify-content: flex-start;' : 'justify-content: flex-end;'}
    `;

        messageDiv.innerHTML = `
      <div style="
        max-width: 70%;
        padding: 10px 14px;
        border-radius: 12px;
        ${isBot
                ? 'background-color: white; color: #1f2937;'
                : `background-color: ${config.primaryColor}; color: white;`
            }
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        font-size: 14px;
        line-height: 1.5;
      ">
        ${escapeHtml(content)}
      </div>
    `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Store message
        messages.push({ sender, content, timestamp: Date.now() });
    }

    /**
     * Escape HTML
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Save chat history to localStorage
     */
    function saveChatHistory() {
        localStorage.setItem('montrai_chat_history', JSON.stringify(messages));
    }

    /**
     * Load chat history from localStorage
     */
    function loadChatHistory() {
        const stored = localStorage.getItem('montrai_chat_history');
        if (stored) {
            try {
                messages = JSON.parse(stored);
                messages.forEach(msg => {
                    if (msg.sender !== 'bot' || msg.content !== config.greeting) {
                        addMessage(msg.sender, msg.content);
                    }
                });
            } catch (error) {
                console.error('[MontrAI] Failed to load chat history:', error);
            }
        }
    }

    // Expose global API
    window.MontrAI = {
        init,
        open: () => { if (!isOpen) toggleChat(); },
        close: () => { if (isOpen) toggleChat(); },
        sendMessage: (content) => {
            document.getElementById('montrai-input').value = content;
            sendMessage();
        },
    };

    // Auto-initialize if config is provided
    if (window.MontrAIConfig) {
        init(window.MontrAIConfig);
    }
})();
