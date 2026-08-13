import requests
search = requests.get('https://api.github.com/search/repositories?q=user%3Awarheart1984-ctrl+upl+language&per_page=20')
if search.status_code == 200:
    for item in search.json()['items'][:10]:
        print(f"  {item['full_name']}: {item['description'][:80] if item.get('description') else ''} - {item['language']}")
else:
    print("Search status:", search.status_code)

# Also search for Universal Language
search2 = requests.get('https://api.github.com/search/repositories?q=user%3Awarheart1984-ctrl+universal+language&per_page=20')
if search2.status_code == 200:
    for item in search2.json()['items'][:10]:
        print(f"  {item['full_name']}: {item['description'][:80] if item.get('description') else ''} - {item['language']}")