import requests
import subprocess
import base64

# Test 1: Lemonade chat
print("=== Test 1: Lemonade Chat ===")
r = requests.post('http://localhost:13305/api/v1/chat/completions', json={
    'model': 'Llama-3.2-1B-Instruct-GGUF',
    'messages': [{'role': 'user', 'content': 'Hello! Say hi back.'}],
    'max_tokens': 50,
    'stream': False
}, timeout=30)
print(f'Status: {r.status_code}')
resp = r.json()
print(f'Response: {resp["choices"][0]["message"]["content"]}')

# Test 2: Lemonade TTS
print('\n=== Test 2: Lemonade TTS ===')
r = requests.post('http://localhost:13305/api/v1/audio/speech', json={
    'model': 'kokoro-v1',
    'input': 'Testing local TTS from the app',
    'voice': 'shimmer',
    'response_format': 'mp3'
}, timeout=30)
print(f'Status: {r.status_code}')
print(f'Audio size: {len(r.content)} bytes')

# Test 3: 4D Render via npm
print('\n=== Test 3: 4D Render CLI ===')
result = subprocess.run(['npm', 'run', 'render', '--', '--surface', 'tesseract', '--mode', 'wireframe', '--width', '256', '--height', '256', '--output', 'output/test_cli.png'], cwd='G:/Mandala Rendering Software/4d-renderer', shell=True, capture_output=True, text=True, timeout=120)
print(f'Return code: {result.returncode}')
print(f'Stdout: {result.stdout[-500:]}')