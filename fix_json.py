import json

# Check execution-plan.json
path = r'G:\Mandala Rendering Software\governance\contracts\v1\schemas\execution-plan.json'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

try:
    json.loads(content)
    print("OK")
except json.JSONDecodeError as e:
    print("Error:", e)
    print("Line:", e.lineno, "col", e.colno, ":", e.msg)
    lines = content.split('\n')
    start = max(0, e.lineno - 3)
    end = min(len(content.split('\n')), e.lineno + 2)
    for i in range(max(0, e.lineno - 3), min(len(content.split('\n')), e.lineno + 2)):
        print('{}: {}'.format(i+1, repr(content.split('\n')[i])))