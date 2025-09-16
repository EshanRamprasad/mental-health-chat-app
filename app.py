import os
import logging
import time
from typing import Optional, Mapping, Any
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import OpenAI, OpenAIError
from flask_talisman import Talisman
import tempfile
from pydub import AudioSegment
import base64
from functools import wraps
from datetime import datetime, timedelta
import threading

# Configure logging - reduce level for production
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Verify OPENAI_API_KEY at startup
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable is not set")

# Initialize OpenAI client once
openai_client = OpenAI(api_key=OPENAI_API_KEY)

app = Flask(__name__)
app.debug = False  # Disable debug mode for production

# Updated CSP headers to allow Spotify content
csp = {
    'default-src': ["'self'", 'cdn.jsdelivr.net', 'cdn.replit.com'],
    'script-src': ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdn.replit.com', 'open.spotify.com'],
    'style-src': ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdn.replit.com'],
    'img-src': ["'self'", 'data:', 'cdn.jsdelivr.net', 'cdn.replit.com'],
    'connect-src': ["'self'", 'api.openai.com'],
    'font-src': ["'self'", 'data:', 'cdn.jsdelivr.net', 'cdn.replit.com'],
    'media-src': ["'self'", 'data:'],
    'frame-src': ["'self'", 'open.spotify.com'],  # Allow Spotify iframes
    'frame-ancestors': ["'self'"]
}

# Initialize Talisman with updated settings
# force_https should be True in production
is_production = os.environ.get('ENVIRONMENT') == 'production'
Talisman(app, content_security_policy=csp, force_https=is_production)

# Configure CORS with updated settings
CORS(app,
     supports_credentials=True,
     resources={
         r"/*": {
             "origins": os.environ.get("ALLOWED_ORIGINS", "http://localhost:5000").split(","),
             "methods": ["GET", "POST", "OPTIONS"],
             "allow_headers": ["Content-Type", "Authorization"],
             "expose_headers": ["Content-Type"],
             "max_age": 3600
         }
     })

app.secret_key = os.environ.get("FLASK_SECRET_KEY") or os.urandom(24).hex()

def get_ai_response(prompt: str, health_data: Optional[Mapping[str, Any]] = None) -> str:
    try:
        logger.debug(f"Sending request to OpenAI API with prompt: {prompt[:50]}...")
        start_time = time.time()

        # Format system message with health data
        base_system_message = """You are anxiety counsellor and address concerns of middle and high schoolers."""

        if health_data:
            health_context = f" The student you are talking to got {health_data.get('sleepHours', 'unknown')} hours of sleep last night. Their PHQ4 results show: Anxiety Score: {health_data.get('anxietyScore', 'unknown')}/6, Depression Score: {health_data.get('depressionScore', 'unknown')}/6, Total Score: {health_data.get('totalScore', 'unknown')}/12."
            base_system_message += health_context

        # Add assessment data if available
        if health_data and health_data.get('assessmentType'):
            assessment_type = health_data['assessmentType']
            assessment_score = health_data.get('assessmentScore', 'unknown')
            if assessment_type == 'gad7':
                base_system_message += f" Recent GAD-7 assessment score: {assessment_score}/21."
            elif assessment_type == 'phq9':
                base_system_message += f" Recent PHQ-9 assessment score: {assessment_score}/27."
            elif assessment_type == 'sleep':
                base_system_message += f" Recent sleep quality score: {assessment_score}/10."

        # Add the rest of the system message
        system_message = base_system_message + """ Keep the tips and advice conversational instead of giving them a list of bullet points. Keep your response under 5 sentences and any tips short."""

        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ]
        )

        logger.debug(f"OpenAI API response time: {time.time() - start_time:.2f}s")
        content = response.choices[0].message.content
        if not content:
            logger.warning("Empty response received from OpenAI API")
            return "I apologize, but I received an empty response. Please try again."

        return content

    except OpenAIError as e:
        logger.error(f"OpenAI API error: {str(e)}", exc_info=True)
        error_message = str(e)
        if "rate limit" in error_message.lower():
            return "I'm receiving too many requests right now. Please wait a moment and try again."
        elif "invalid_api_key" in error_message.lower():
            return "There's an issue with the API configuration. Please contact support."
        else:
            return "I encountered an error while processing your request. Please try again in a moment."

    except Exception as e:
        logger.error(f"Unexpected error in AI response: {str(e)}", exc_info=True)
        return "I apologize, but I encountered an unexpected error. Please try again later."

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat')
def chat():
    return render_template('chat.html')

@app.route('/assessments')
def assessments():
    return render_template('assessments.html')

# CORS already configured above with restricted origins

@app.route('/voice-to-text', methods=['POST'])
def voice_to_text():
    temp_files = []
    try:
        data = request.get_json()
        if not data or 'audio' not in data:
            return jsonify({'error': 'No audio data provided'}), 400

        logger.info("Received voice-to-text request")

        # Validate audio data format
        try:
            audio_data_parts = data['audio'].split(',')
            if len(audio_data_parts) != 2 or not audio_data_parts[0].startswith('data:audio/'):
                raise ValueError("Invalid audio data format")

            content_type = audio_data_parts[0].split(';')[0].split('/')[1]
            logger.info(f"Detected audio format: {content_type}")

            # Decode base64 audio data
            audio_data = base64.b64decode(audio_data_parts[1])
        except Exception as e:
            logger.error(f"Audio data validation failed: {str(e)}")
            return jsonify({'error': 'Invalid audio data format', 'details': str(e)}), 400

        # Save audio data to a temporary file
        try:
            with tempfile.NamedTemporaryFile(suffix=f'.{content_type}', delete=False) as temp_audio:
                temp_audio.write(audio_data)
                temp_audio_path = temp_audio.name
                temp_files.append(temp_audio_path)
                logger.debug(f"Saved temporary audio file: {temp_audio_path}")
        except Exception as e:
            logger.error(f"Failed to save temporary audio file: {str(e)}")
            return jsonify({'error': 'Failed to process audio data', 'details': str(e)}), 500

        # Convert to WAV format
        try:
            audio = AudioSegment.from_file(temp_audio_path)
            wav_path = temp_audio_path + '.wav'
            temp_files.append(wav_path)
            audio.export(wav_path, format='wav', parameters=["-ac", "1", "-ar", "16000"])
            logger.debug(f"Converted audio to WAV format: {wav_path}")
        except Exception as e:
            logger.error(f"Audio conversion failed: {str(e)}")
            return jsonify({'error': 'Failed to convert audio format', 'details': str(e)}), 500

        # Transcribe using Whisper API
        try:
            with open(wav_path, 'rb') as audio_file:
                transcript = openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="en"
                )
            logger.info("Successfully transcribed audio")

            # Get AI response for the transcribed text
            ai_response = get_ai_response(transcript.text)

            return jsonify({
                'text': transcript.text,
                'response': ai_response
            })

        except Exception as e:
            logger.error(f"Transcription failed: {str(e)}")
            return jsonify({'error': 'Failed to transcribe audio', 'details': str(e)}), 500

    except Exception as e:
        logger.error(f"Unexpected error in voice processing: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500

    finally:
        # Clean up temporary files
        for temp_file in temp_files:
            try:
                if os.path.exists(temp_file):
                    os.unlink(temp_file)
                    logger.debug(f"Cleaned up temporary file: {temp_file}")
            except Exception as e:
                logger.warning(f"Failed to clean up temporary file {temp_file}: {str(e)}")

@app.route('/voice-chat')
def voice_chat():
    return render_template('voice_chat.html')


def rate_limit(seconds=1):
    """Rate limiting decorator to prevent duplicate submissions"""
    last_request_time = {}
    lock = threading.Lock()

    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            client_ip = request.remote_addr
            current_time = datetime.now()

            with lock:
                if client_ip in last_request_time:
                    time_passed = current_time - last_request_time[client_ip]
                    if time_passed < timedelta(seconds=seconds):
                        return jsonify({
                            'error': 'Please wait before sending another message',
                            'retry_after': seconds
                        }), 429

                last_request_time[client_ip] = current_time
            return f(*args, **kwargs)
        return wrapped
    return decorator

@app.route('/chat', methods=['POST'])
@rate_limit(seconds=1)  # Add rate limiting
def process_chat():
    try:
        logger.info(f"Received request: {request.method} {request.path}")

        # Validate request content type
        if not request.is_json:
            logger.error("Invalid content type")
            return jsonify({'error': 'Content-Type must be application/json'}), 400

        data = request.get_json()
        # Avoid logging sensitive health data in production

        if not data or 'message' not in data:
            logger.error("Invalid request format")
            return jsonify({'error': 'Invalid request format'}), 400

        user_message = data['message'].strip()
        health_data = data.get('healthData', {})

        if not user_message:
            logger.error("Empty message received")
            return jsonify({'error': 'Empty message'}), 400

        logger.info(f"Processing message of length: {len(user_message)} characters")

        try:
            ai_response = get_ai_response(user_message, health_data)
            if not ai_response:
                raise ValueError("Empty response from AI")

            logger.info("Successfully generated response")
            return jsonify({
                'status': 'success',
                'response': ai_response
            })

        except OpenAIError as e:
            logger.error(f"OpenAI API error: {str(e)}")
            return jsonify({
                'error': 'AI service temporarily unavailable',
                'message': str(e)
            }), 503

    except Exception as e:
        logger.error(f"Error processing chat: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Server error',
            'message': 'An unexpected error occurred. Please try again.'
        }), 500

@app.route('/health')
def health_check():
    """Simple health check without external API calls"""
    return jsonify({
        'status': 'healthy',
        'timestamp': time.time(),
        'environment': os.environ.get('ENVIRONMENT', 'development'),
        'debug_mode': app.debug
    })

@app.route('/robots.txt')
def static_from_root():
    return send_from_directory(app.static_folder or 'static', request.path[1:])

@app.route('/sitemap.xml')
def sitemap():
    return send_from_directory(app.static_folder or 'static', 'sitemap.xml')

@app.route('/podcasts')
def podcasts():
    """Route for the mental health podcasts page"""
    return render_template('podcasts.html')

@app.route('/talk')
def talk():
    """Route for the Talk Now feature"""
    return render_template('voice_chat.html')  # Changed from talk.html to voice_chat.html

@app.route('/meditations')
def meditations():
    """Route for guided meditations page"""
    return render_template('meditations.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)