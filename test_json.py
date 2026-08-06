import json

path = r'G:\Mandala Rendering Software\governance\contracts\v1\schemas\execution-plan.json'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Check if it's valid JSON
try:
    json.loads(content)
    print('OK')
except json.JSONDecodeError as e:
    print(f'Error: {e}')
    print(f'Line {e.lineno}, col {e.colno}: {e.msg}')

# Also check the raw bytes
with open(path, 'rb') as f:
    content = f.read()
    print('Last 50 bytes:', repr(content[-50:]))
    print('Ends with newline:', content.endswith(b'\n'))
    print('Ends with }\\n:', content.endswith(b'}\n'))