import pyaudio
import wave
import io
import asyncio
from typing import Dict, Optional

class AudioHandler:
    def __init__(self):
        self.p = pyaudio.PyAudio()
        self.streams: Dict[int, pyaudio.Stream] = {}
        self.audio_format = pyaudio.paInt16
        self.channels = 1
        self.rate = 48000
        self.chunk = 1024

    def create_input_stream(self, user_id: int) -> Optional[pyaudio.Stream]:
        try:
            stream = self.p.open(
                format=self.audio_format,
                channels=self.channels,
                rate=self.rate,
                input=True,
                frames_per_buffer=self.chunk
            )
            self.streams[user_id] = stream
            return stream
        except Exception as e:
            print(f"Error creating input stream: {e}")
            return None

    def create_output_stream(self, user_id: int) -> Optional[pyaudio.Stream]:
        try:
            stream = self.p.open(
                format=self.audio_format,
                channels=self.channels,
                rate=self.rate,
                output=True,
                frames_per_buffer=self.chunk
            )
            self.streams[user_id] = stream
            return stream
        except Exception as e:
            print(f"Error creating output stream: {e}")
            return None

    def process_audio(self, audio_data: bytes) -> bytes:
        try:
            # Convert WebM audio to raw PCM
            with io.BytesIO(audio_data) as webm_file:
                # Here you would implement WebM to PCM conversion
                # For now, we'll just return the raw data
                return audio_data
        except Exception as e:
            print(f"Error processing audio: {e}")
            return b''

    def play_audio(self, user_id: int, audio_data: bytes):
        try:
            if user_id in self.streams:
                stream = self.streams[user_id]
                processed_data = self.process_audio(audio_data)
                stream.write(processed_data)
        except Exception as e:
            print(f"Error playing audio: {e}")

    def close_stream(self, user_id: int):
        if user_id in self.streams:
            try:
                self.streams[user_id].stop_stream()
                self.streams[user_id].close()
                del self.streams[user_id]
            except Exception as e:
                print(f"Error closing stream: {e}")

    def cleanup(self):
        for user_id in list(self.streams.keys()):
            self.close_stream(user_id)
        self.p.terminate()

# Create a global instance
audio_handler = AudioHandler() 