import requests
import base64

r = requests.get("https://api.github.com/repos/warheart1984-ctrl/ul-language-vm")
d = r.json()
print("Name:", d.get("name"))
print("Description:", d.get("description"))
print("Stars:", d.get("stargazers_count"))
print("Updated:", d.get("updated_at"))
print("Languages:", d.get("languages", {}))

# Get readme from html_url
html_url = d.get("html_url", "")
r2 = requests.get(html_url + "/readme")
print("Readme status:", r2.status_code)
if r2.status_code == 200:
    # Readme content is in r2.text, not base64 decoded from JSON
    content = r2.text[:500]
    print("\nReadme first 500 chars:")
    print(content)
elif r2.status_code == 404:
    print("No readme file found")