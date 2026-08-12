import sqlite3
import json

db_path = r'C:\Users\mosta\.local\share\opencode\opencode.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

results = []

cur.execute("SELECT data FROM event WHERE CAST(data AS TEXT) LIKE '%bcrypt iteration%'")
for row in cur.fetchall():
    try:
        results.append(json.loads(row[0]))
    except:
        results.append({"raw": row[0]})

cur.execute("SELECT data FROM part WHERE CAST(data AS TEXT) LIKE '%bcrypt iteration%'")
for row in cur.fetchall():
    try:
        results.append(json.loads(row[0]))
    except:
        results.append({"raw": row[0]})

with open('plan.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

conn.close()
