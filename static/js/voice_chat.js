document.addEventListener('DOMContentLoaded', function() {
    const micButton = document.getElementById('micButton');
    const chatMessages = document.getElementById('chatMessages');
    const statusIndicator = document.querySelector('.voice-status-indicator');
    const statusText = statusIndicator.querySelector('.voice-status-text');
    const startSound = document.getElementById('startRecordingSound');
    const stopSound = document.getElementById('stopRecordingSound');

    // Set audio volume
    if (startSound) startSound.volume = 0.5;
    if (stopSound) stopSound.volume = 0.5;

    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let speechSynthesis = window.speechSynthesis;
    let voices = [];

    // Initialize voice selection with enhanced natural voice preferences
    function populateVoiceList() {
        voices = speechSynthesis.getVoices();

        // Filter for English voices
        voices = voices.filter(voice => voice.lang.startsWith('en'));

        if (voices.length === 0) {
            console.warn('No English voices available');
            return;
        }

        // Enhanced voice selection prioritizing natural-sounding voices
        const preferredVoice = voices.find(voice => 
            (voice.name.includes('Neural') || voice.name.includes('Premium') || 
             voice.name.includes('Natural') || voice.name.includes('Enhanced')) &&
            !voice.name.includes('Mobile') // Avoid mobile voices which might be lower quality
        );

        const defaultVoice = preferredVoice || voices[0];
        console.log('Selected voice:', defaultVoice.name);
        return defaultVoice;
    }

    // Initialize voices when available
    let selectedVoice;
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => {
            selectedVoice = populateVoiceList();
            // Speak initial greeting after voices are loaded
            const initialGreeting = document.querySelector('#initialGreeting .message-content');
            if (initialGreeting) {
                speakResponse(initialGreeting.textContent);
            }
        };
    }

    // Enhanced text-to-speech function with natural speech parameters
    function speakResponse(text) {
        return new Promise((resolve, reject) => {
            try {
                console.log('Starting text-to-speech...');

                // Cancel any ongoing speech
                speechSynthesis.cancel();

                const utterance = new SpeechSynthesisUtterance(text);

                // Set voice if available
                if (!selectedVoice) {
                    selectedVoice = populateVoiceList();
                }
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                }

                // Configure speech parameters for more natural sound
                utterance.volume = 1.0;
                utterance.rate = 0.9;    // Slightly slower for more natural pace
                utterance.pitch = 1.1;   // Slightly higher pitch for more engaging tone

                // Event handlers
                utterance.onstart = () => {
                    console.log('Speech started');
                    statusText.textContent = 'AI is speaking...';
                };

                utterance.onend = () => {
                    console.log('Speech completed');
                    statusText.textContent = 'Click the mic to start talking';
                    resolve();
                };

                utterance.onerror = (event) => {
                    console.error('Speech synthesis error:', event);
                    statusText.textContent = 'Error in speech playback';
                    reject(event);
                };

                // Start speaking
                speechSynthesis.speak(utterance);

            } catch (error) {
                console.error('Text-to-speech error:', error);
                statusText.textContent = 'Failed to start speech';
                reject(error);
            }
        });
    }

    // Request microphone access
    async function setupAudioRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const reader = new FileReader();

                reader.onload = async function() {
                    try {
                        statusText.textContent = "Processing your message...";
                        const base64Audio = reader.result;

                        // Send audio to server
                        const response = await fetch('/voice-to-text', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ audio: base64Audio })
                        });

                        if (!response.ok) {
                            throw new Error('Server response was not ok');
                        }

                        const data = await response.json();

                        // Display user's transcribed message
                        if (data.text) {
                            appendMessage(data.text, 'user');
                        }

                        // Display and speak AI's response
                        if (data.response) {
                            appendMessage(data.response, 'ai');
                            await speakResponse(data.response);
                        }

                        statusText.textContent = 'Click the mic to start talking';

                    } catch (error) {
                        console.error('Error processing voice:', error);
                        statusText.textContent = 'An error occurred. Please try again.';
                        appendMessage("Sorry, I couldn't process your message. Please try again.", 'ai');
                    }
                };

                reader.readAsDataURL(audioBlob);
                audioChunks = [];
            };

            micButton.disabled = false;
            statusText.textContent = 'Click the mic to start talking';

        } catch (error) {
            console.error('Error accessing microphone:', error);
            statusText.textContent = 'Could not access microphone';
            micButton.disabled = true;
        }
    }

    function appendMessage(content, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(timeDiv);

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    micButton.addEventListener('click', async () => {
        if (!mediaRecorder) {
            await setupAudioRecording();
            return;
        }

        if (!isRecording) {
            try {
                // Start recording
                audioChunks = [];
                mediaRecorder.start();
                isRecording = true;
                micButton.classList.add('recording');
                statusText.textContent = 'Recording... Click to stop';
                if (startSound) {
                    await startSound.play().catch(console.error);
                }
            } catch (error) {
                console.error('Error starting recording:', error);
            }
        } else {
            try {
                // Stop recording
                mediaRecorder.stop();
                isRecording = false;
                micButton.classList.remove('recording');
                if (stopSound) {
                    await stopSound.play().catch(console.error);
                }
            } catch (error) {
                console.error('Error stopping recording:', error);
            }
        }
    });

    // Initial setup
    setupAudioRecording();

    // Initialize speech synthesis
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged();
    }
});