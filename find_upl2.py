import requests
search = requests.get("https://api.github.com/search/repositories?q=user%3Awarheart1984-ctrl+upl+language&per_page=20")
print("Status:", search.status_code)
if search.status_code == 200:
    print("Total:", search.json().get("total_count", 0))
    for item in search.json().get("items", [])[:10]:
        print(f"  {item['full_name']}: {item['description'][:80] if item.get('description') else ''} - {item['language']}")