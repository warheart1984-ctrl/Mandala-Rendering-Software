import requests, base64
r = requests.get("https://api.github.com/repos/warheart1984-ctrl/ul-language-vm/contents/ul_core_1.py")
d = r.json()
content = base64.b64decode(d["content"]).decode("utf-8")
print(content)