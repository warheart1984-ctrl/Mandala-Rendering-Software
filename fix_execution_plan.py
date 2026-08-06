import json

# Fix the execution-plan.json file
path = r'G:\Mandala Rendering Software\governance\contracts\v1\schemas\execution-plan.json'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the schema URL
content = content.replace(
    '  "$schema": "http://json-schema.org/draft-07/schema',
    '  "$schema": "http://json-schema.org/draft-07/schema#"'
)

with open(r'G:\Mandala Rendering Software\governance\contracts\v1\schemas\execution-plan.json', 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed')