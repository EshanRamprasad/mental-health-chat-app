document.addEventListener('DOMContentLoaded', function() {
    const chatForm = document.getElementById('chatForm');
    const messageInput = document.getElementById('messageInput');
    const chatMessages = document.getElementById('chatMessages');
    const isVoiceInterface = !messageInput; // Check if we're in voice chat interface
    const TIMEOUT_MS = 10000;
    const MAX_RETRIES = 2;

    // Voice interface elements
    const voiceStatusIndicator = document.querySelector('.voice-status-indicator');
    const voiceStatusText = document.querySelector('.voice-status-text');
    const startRecordingSound = document.getElementById('startRecordingSound');
    const stopRecordingSound = document.getElementById('stopRecordingSound');
    
    // Voice recognition setup
    let recognition = null;
    let isRecording = false;
    let speechSynthesis = window.speechSynthesis;
    let isSpeaking = false;
    let continuousMode = false;

    // Initialize voice selection
    let voices = [];
    function populateVoiceList() {
        voices = speechSynthesis.getVoices();
        const voiceSelect = document.getElementById('voiceSelect');
        if (!voiceSelect) return;
        
        voiceSelect.innerHTML = '<option value="">Select Voice</option>';
        
        // Filter for high-quality English voices
        const preferredVoices = voices.filter(voice => 
            voice.lang.startsWith('en') && 
            (voice.name.includes('Neural') || voice.name.includes('Premium'))
        );
        
        const otherEnglishVoices = voices.filter(voice => 
            voice.lang.startsWith('en') && 
            !preferredVoices.includes(voice)
        );
        
        // Add preferred voices first
        preferredVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voices.indexOf(voice);
            option.textContent = `${voice.name} (Premium)`;
            option.selected = voice.name.includes('Neural');
            voiceSelect.appendChild(option);
        });
        
        // Then add other English voices
        otherEnglishVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voices.indexOf(voice);
            option.textContent = voice.name;
            voiceSelect.appendChild(option);
        });
    }

    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }

    // Voice status management with improved feedback
    function updateVoiceStatus(status, message) {
        if (!voiceStatusIndicator) return;
        
        voiceStatusIndicator.className = 'voice-status-indicator active';
        
        switch(status) {
            case 'listening':
                voiceStatusIndicator.classList.add('listening');
                voiceStatusText.textContent = message || 'Listening...';
                micButton.classList.add('recording');
                break;
            case 'processing':
                voiceStatusIndicator.classList.remove('listening', 'speaking');
                voiceStatusText.textContent = message || 'Processing...';
                break;
            case 'speaking':
                voiceStatusIndicator.classList.add('speaking');
                voiceStatusText.textContent = message || 'Speaking...';
                break;
            case 'error':
                voiceStatusIndicator.classList.add('error');
                voiceStatusText.textContent = message || 'Error occurred';
                micButton.classList.remove('recording');
                setTimeout(() => updateVoiceStatus('idle'), 3000);
                break;
            case 'idle':
            default:
                voiceStatusIndicator.className = 'voice-status-indicator';
                voiceStatusText.textContent = 'Click the mic to start talking';
                micButton.classList.remove('recording');
                break;
        }
    }

    // Enhanced voice recognition with better error handling
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        recognition = new (window.webkitSpeechRecognition || window.SpeechRecognition)();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        // Voice recording setup
        let mediaRecorder = null;
        let audioChunks = [];
        let recordingStream = null;

        const startRecording = async () => {
            try {
                recordingStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        channelCount: 1,
                        sampleRate: 16000,
                        echoCancellation: true,
                        noiseSuppression: true
                    }
                });
                
                mediaRecorder = new MediaRecorder(recordingStream, {
                    mimeType: 'audio/webm;codecs=opus'
                });
                
                audioChunks = [];
                
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };
                
                mediaRecorder.onstop = async () => {
                    try {
                        updateVoiceStatus('processing', 'Processing audio...');
                        
                        if (audioChunks.length === 0) {
                            throw new Error('No audio data recorded');
                        }
                        
                        const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                        if (audioBlob.size > 25 * 1024 * 1024) { // 25MB limit
                            throw new Error('Recording too long');
                        }
                        
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                            try {
                                const response = await fetch('/voice-to-text', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        audio: reader.result
                                    })
                                });
                                
                                if (!response.ok) {
                                    throw new Error(`Server error: ${response.status}`);
                                }
                                
                                const data = await response.json();
                                if (data.error) {
                                    throw new Error(data.error);
                                }
                                
                                if (data.text && data.text.trim()) {
                                    const transcribedText = data.text.trim();
                                    if (isVoiceInterface) {
                                        // In voice interface, directly submit the transcribed text
                                        handleMessageSubmission(transcribedText);
                                    } else if (messageInput) {
                                        // In text interface, update input field
                                        messageInput.value = transcribedText;
                                        if (!continuousMode) {
                                            chatForm.dispatchEvent(new Event('submit'));
                                        }
                                    }
                                } else {
                                    throw new Error('No text was transcribed');
                                }
                                
                                updateVoiceStatus('idle');
                                
                            } catch (error) {
                                console.error('Voice processing error:', error);
                                updateVoiceStatus('error', `Error: ${error.message}`);
                                addMessage(error.message, false, true);
                            }
                        };
                        
                        reader.onerror = () => {
                            updateVoiceStatus('error', 'Failed to process recording');
                        };
                        
                        reader.readAsDataURL(audioBlob);
                        
                    } finally {
                        audioChunks = [];
                        if (recordingStream) {
                            recordingStream.getTracks().forEach(track => track.stop());
                            recordingStream = null;
                        }
                    }
                };
                
                mediaRecorder.start(1000); // Collect data every second
                updateVoiceStatus('listening', 'Recording...');
                startRecordingSound.play().catch(console.error);
                
            } catch (error) {
                console.error('Failed to start recording:', error);
                updateVoiceStatus('error', 'Failed to access microphone');
                addMessage('Please enable microphone access to use voice input', false, true);
            }
        };

        const stopRecording = () => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                stopRecordingSound.play().catch(console.error);
            }
            
            if (recordingStream) {
                recordingStream.getTracks().forEach(track => track.stop());
                recordingStream = null;
            }
        };

        // Enhanced text-to-speech with error handling
        function speakResponse(text) {
            const toggleSpeechBtn = document.getElementById('toggleSpeech');
            if (!speechSynthesis || !toggleSpeechBtn || !toggleSpeechBtn.classList.contains('active')) return;
            
            try {
                speechSynthesis.cancel(); // Stop any current speech
                
                const utterance = new SpeechSynthesisUtterance(text);
                const selectedVoice = voices[voiceSelect.value];
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                }
                
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                
                utterance.onstart = () => {
                    isSpeaking = true;
                    updateVoiceStatus('speaking');
                };
                
                utterance.onend = () => {
                    isSpeaking = false;
                    updateVoiceStatus('idle');
                    if (continuousMode && !isRecording) {
                        setTimeout(() => {
                            if (!isSpeaking) startRecording();
                        }, 500);
                    }
                };
                
                utterance.onerror = (event) => {
                    console.error('Speech synthesis error:', event);
                    isSpeaking = false;
                    updateVoiceStatus('error', 'Failed to speak response');
                };
                
                speechSynthesis.speak(utterance);
                
            } catch (error) {
                console.error('Text-to-speech error:', error);
                updateVoiceStatus('error', 'Text-to-speech failed');
            }
        }

        // Mic button handler
        const micButton = document.getElementById('micButton');
        if (micButton) {
            micButton.addEventListener('click', function() {
                if (!isRecording) {
                    startRecording();
                    isRecording = true;
                } else {
                    stopRecording();
                    isRecording = false;
                    continuousMode = false;
                }
            });

            // Double click for continuous mode
            micButton.addEventListener('dblclick', function(e) {
                e.preventDefault();
                continuousMode = !continuousMode;
                addMessage(`Continuous conversation mode ${continuousMode ? 'enabled' : 'disabled'}`, false, true);
                if (continuousMode && !isRecording) {
                    startRecording();
                }
            });
        }

        // Toggle speech button handler
        const toggleSpeechBtn = document.getElementById('toggleSpeech');
        if (toggleSpeechBtn) {
            toggleSpeechBtn.addEventListener('click', function() {
                toggleSpeechBtn.classList.toggle('active');
                const voiceSelect = document.getElementById('voiceSelect');
                if (voiceSelect) {
                    voiceSelect.style.display = voiceSelect.style.display === 'none' ? 'inline-block' : 'none';
                }
                
                if (!toggleSpeechBtn.classList.contains('active') && isSpeaking) {
                    speechSynthesis.cancel();
                    isSpeaking = false;
                    updateVoiceStatus('idle');
                }
            });
        }
    }

    // Message handling functions
    function addMessage(content, isUser = false, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        if (isError) {
            messageContent.style.backgroundColor = 'var(--bs-danger)';
        }
        messageContent.textContent = content;

        const messageTime = document.createElement('div');
        messageTime.className = 'message-time';
        messageTime.textContent = new Date().toLocaleTimeString();

        messageDiv.appendChild(messageContent);
        messageDiv.appendChild(messageTime);
        chatMessages.appendChild(messageDiv);

        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Check if speech is enabled before speaking responses
        const toggleSpeechBtn = document.getElementById('toggleSpeech');
        if (!isUser && !isError && toggleSpeechBtn && toggleSpeechBtn.classList.contains('active')) {
            speakResponse(content);
        }
    }

    // Initialize UI
    if (document.getElementById('voiceSelect')) {
        populateVoiceList();
    }
    
    if (messageInput) {
        messageInput.focus();
    }

    // Initialize survey modal and health data
    const surveyModal = new bootstrap.Modal(document.getElementById('surveyModal'));
    let userHealthData = {};

    // Check for assessment data from previous page
    const assessmentData = sessionStorage.getItem('assessmentData');
    if (assessmentData) {
        userHealthData = { ...userHealthData, ...JSON.parse(assessmentData) };
        sessionStorage.removeItem('assessmentData');
    }

    // Show modal when page loads (only if no assessment data)
    if (!assessmentData) {
        surveyModal.show();
    }

    // Handle survey submission
    document.getElementById('healthSurvey').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const sleepHours = document.getElementById('sleepHours').value;
        const phq4_1 = parseInt(document.getElementById('phq4_1').value);
        const phq4_2 = parseInt(document.getElementById('phq4_2').value);
        const phq4_3 = parseInt(document.getElementById('phq4_3').value);
        const phq4_4 = parseInt(document.getElementById('phq4_4').value);
        
        const anxietyScore = phq4_1 + phq4_2;
        const depressionScore = phq4_3 + phq4_4;
        const totalScore = anxietyScore + depressionScore;
        
        userHealthData = {
            ...userHealthData,
            sleepHours,
            anxietyScore,
            depressionScore,
            totalScore
        };
        
        surveyModal.hide();
        
        // Play initial greeting after modal is hidden
        const greetingText = document.querySelector('#initialGreeting .message-content').textContent;
        setTimeout(() => {
            speakResponse(greetingText);
        }, 500);
    });

    // Create connection status indicator
    const statusIndicator = document.createElement('div');
    statusIndicator.className = 'connection-status';
    statusIndicator.style.position = 'fixed';
    statusIndicator.style.top = '70px';
    statusIndicator.style.right = '20px';
    statusIndicator.style.padding = '8px 16px';
    statusIndicator.style.borderRadius = '20px';
    statusIndicator.style.zIndex = '1000';
    document.body.appendChild(statusIndicator);

    // Create loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `
        <div class="spinner-border text-info" role="status">
            <span class="visually-hidden">Loading...</span>
        </div>
        <div class="loading-text">Processing your message...</div>
    `;
    loadingIndicator.style.display = 'none';
    loadingIndicator.style.position = 'fixed';
    loadingIndicator.style.bottom = '100px';
    loadingIndicator.style.left = '50%';
    loadingIndicator.style.transform = 'translateX(-50%)';
    loadingIndicator.style.backgroundColor = 'var(--bs-dark)';
    loadingIndicator.style.padding = '1rem';
    loadingIndicator.style.borderRadius = '8px';
    loadingIndicator.style.zIndex = '1000';
    document.body.appendChild(loadingIndicator);

    // Initialize Feather icons
    feather.replace();

    function displayError(error) {
        console.error('Error:', error);
        const errorMessage = error.message || 'An error occurred. Please try again.';
        addMessage(errorMessage, false, true);
        updateConnectionStatus('disconnected', '🔴 ' + errorMessage);
    }

    function showLoading(show) {
        loadingIndicator.style.display = show ? 'flex' : 'none';
        if (messageInput) {
            messageInput.disabled = show;
        }
    }

    function updateConnectionStatus(status, message) {
        statusIndicator.textContent = message;
        switch(status) {
            case 'connected':
                statusIndicator.style.backgroundColor = 'var(--bs-success)';
                statusIndicator.style.color = 'white';
                break;
            case 'disconnected':
                statusIndicator.style.backgroundColor = 'var(--bs-danger)';
                statusIndicator.style.color = 'white';
                break;
            case 'connecting':
                statusIndicator.style.backgroundColor = 'var(--bs-warning)';
                statusIndicator.style.color = 'black';
                break;
        }
    }

    async function checkConnection() {
        try {
            const response = await fetch('/health');
            const data = await response.json();
            
            if (response.ok && data.status === 'healthy') {
                updateConnectionStatus('connected', '🟢 Connected');
                return true;
            } else {
                throw new Error(data.error || 'Health check failed');
            }
        } catch (error) {
            updateConnectionStatus('disconnected', '🔴 Disconnected');
            return false;
        }
    }

    async function sendMessageWithRetry(message, retryCount = 0) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

            if (!navigator.onLine) {
                throw new Error('You are offline. Please check your internet connection.');
            }

            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ 
                    message,
                    healthData: userHealthData 
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Server error: ${response.status}` }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const data = await response.json().catch(() => null);
            if (!data) {
                throw new Error('Invalid response from server');
            }

            return data;
        } catch (error) {
            console.error('Message sending error:', error);

            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }

            if (retryCount < MAX_RETRIES) {
                console.log(`Retrying message (${retryCount + 1}/${MAX_RETRIES})...`);
                await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
                return sendMessageWithRetry(message, retryCount + 1);
            }

            throw error;
        }
    }

    let isSubmitting = false;

    async function handleMessageSubmission(message) {
        if (!message || isSubmitting) return;

        isSubmitting = true;
        showLoading(true);
        updateConnectionStatus('connecting', '🟡 Sending message...');

        try {
            // Add user message
            addMessage(message, true);

            // Send message and handle response
            const response = await sendMessageWithRetry(message);

            if (response.response) {
                addMessage(response.response);
                updateConnectionStatus('connected', '🟢 Connected');
            } else {
                throw new Error('Invalid response format from server');
            }

        } catch (error) {
            console.error('Message handling error:', error);
            displayError(error);
        } finally {
            isSubmitting = false;
            showLoading(false);
            if (messageInput) {
                messageInput.disabled = false;
                messageInput.focus();
            }
        }
    }

    chatForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!messageInput) return;
        const message = messageInput.value.trim();
        if (!message) return;

        messageInput.value = '';
        await handleMessageSubmission(message);
    });

    // Check connection status periodically
    checkConnection();
    setInterval(checkConnection, 30000); // Check every 30 seconds

    // Enable input when page loads (if in text chat interface)
    if (messageInput) {
        messageInput.disabled = false;
        messageInput.focus();
    }
});