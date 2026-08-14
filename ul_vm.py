import requests
import base64

r = requests.get("https://api.github.com/repos/warheart1984-ctrl/ul-language-vm")
print("Status:", r.status_code)
if r.status_code == 200:
    d = r.json()
    print("Name:", d.get("name"))
    print("Description:", d.get("description"))
    print("Stars:", d.get("stargazers_count"))
    print("Updated:", d.get("updated_at"))
    print("Languages:", d.get("languages", {}))
    # Readme
    r2 = requests.get(d["readme_url"])
    if r2.status_code == 200:
        content = base64.b64decode(r2.json().get("content", "")).decode("utf-8", errors="replace")
        print("\nReadme first 500 chars:")
        print(content[:500])