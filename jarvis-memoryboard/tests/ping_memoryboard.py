import http.client, json

def main():
    c = http.client.HTTPConnection("127.0.0.1", 8001, timeout=5)

    c.request("GET", "/health")
    h = json.loads(c.getresponse().read())
    print(f"Health: {h['status']}")
    print(f"Memories stored: {h['memory_count']}")

    c.request("GET", "/api/jarvis/memory")
    m = json.loads(c.getresponse().read())
    print(f"All memories: {len(m['memories'])}")
    for mem in m['memories']:
        print(f"  [{mem['id']}] {mem['content'][:100]}")

    c.request("GET", "/api/jarvis/memory/board")
    b = json.loads(c.getresponse().read())
    print(f"Board: {b['memory_board']['summary']}")

    print("OK: service is live")

if __name__ == "__main__":
    main()
