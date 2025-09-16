# BeStill Mental Health Support Platform

## Overview

BeStill is a comprehensive AI-powered mental health support platform that provides 24/7 anonymous, non-judgmental emotional support through multiple interfaces. The platform combines text-based chat, voice interactions, guided meditations, mental health assessments, and educational podcasts into a unified web application designed to make mental health resources accessible and approachable for users seeking support.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The application uses a server-side rendered architecture built with Flask templating system and Bootstrap for responsive UI components. The frontend implements a dark theme design system with accessibility considerations and mobile-first responsive layouts. JavaScript modules handle real-time chat functionality, voice recording/playback, audio visualizations, and interactive assessments. The interface supports multiple interaction modes including text chat, voice chat, guided meditations with audio players, and interactive mental health screening tools.

### Backend Architecture
The backend is implemented as a Flask web application with a single-file architecture pattern. The main application logic resides in `app.py` with route handlers for different features including chat endpoints, voice processing, static file serving, and assessment functionality. The application uses OpenAI's API for AI-powered responses and implements content security policies through Flask-Talisman for security hardening. Error handling includes custom 404 and 500 pages with appropriate mental health crisis messaging.

### AI Integration
The platform integrates OpenAI's GPT models for conversational AI responses, with specialized prompting for mental health support contexts. Voice functionality includes speech-to-text processing for user input and text-to-speech synthesis for AI responses. The AI system is configured with appropriate safety measures and response guidelines for mental health conversations.

### Security and Privacy
Security implementation includes CORS configuration for cross-origin requests, Content Security Policy headers allowing necessary external resources (including Spotify embeds), and privacy-focused design with anonymous user interactions. The application implements rate limiting considerations and secure API key management through environment variables.

### Media and Content Processing
The platform processes multiple media types including audio file handling through pydub for voice chat functionality, static audio files for guided meditations, and embedded Spotify content for podcast integration. Audio visualization components provide real-time feedback during voice interactions and meditation sessions.

## External Dependencies

### AI Services
- **OpenAI API**: Core conversational AI functionality requiring OPENAI_API_KEY environment variable
- **Speech Processing**: Browser-based Web Speech API for voice recognition and synthesis

### Third-Party Integrations
- **Spotify**: Embedded podcast player integration for mental health educational content
- **Bootstrap**: UI framework delivered via CDN (cdn.replit.com and cdn.jsdelivr.net)
- **Feather Icons**: Icon system for UI components

### Python Libraries
- **Flask**: Core web framework with CORS support and Talisman security middleware
- **pydub**: Audio file processing for voice chat features
- **OpenAI Python Client**: API integration for AI responses

### Frontend Dependencies
- **Web APIs**: MediaRecorder API for voice recording, Speech Recognition API for voice input, Speech Synthesis API for audio responses
- **Audio Processing**: Native HTML5 audio elements for meditation playback and voice feedback sounds

### Content Delivery
- **Static Assets**: Local hosting of custom CSS, JavaScript modules, audio files, and branding assets
- **External Content**: Spotify iframe embeds for podcast content delivery