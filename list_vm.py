import requests
r = requests.get("https://api.github.com/repos/warheart1984-ctrl/ul-language-vm/contents")
print("Status:", r.status_code)
if r.status_code == 200:
    items = r.json()
    print(f"Total files: {len(items)}")
    for item in items[:30]:
        name = item["name"]
        size = item["size"]
        type_ = item["type"]
        print(f"  {name} ({type_}, {size} bytes)")