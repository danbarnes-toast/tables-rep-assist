#!/usr/bin/env python3
"""Run the 20-question QA suite against the live rep-assist dev server."""
import json, sys, urllib.request, urllib.error

BASE = "http://localhost:3000/api/chat"

QUESTIONS = [
    # Host app
    ("Q01", "ask", "Walk me through how the host app works at a restaurant"),
    ("Q02", "ask", "What does a host see when a guest arrives for their reservation?"),
    ("Q03", "train", "Train me on the host app — how does a manager configure it?"),
    # Customer profile
    ("Q04", "ask", "What does a typical Tables customer look like?"),
    ("Q05", "ask", "Describe the profile of restaurants that are most successful with Tables"),
    ("Q06", "ask", "How many covers a night does a typical Tables restaurant do?"),
    # Geographic / account-specific
    ("Q07", "ask", "Do you have a customer in Cleveland?"),
    ("Q08", "ask", "Do you have a customer in Cleveland running a prepaid experience?"),
    ("Q09", "ask", "Show me a Midwest restaurant using Tables for something special"),
    # Entertainment / experiential
    ("Q10", "ask", "Do you have any entertainment venues using Tables — like a bowling alley or arcade bar?"),
    ("Q11", "ask", "We're a bowling alley with a restaurant attached. Are we a good fit?"),
    ("Q12", "ask", "What's an example of a non-traditional restaurant using Tables?"),
    # Ticketed events
    ("Q13", "ask", "What does a ticketed event look like on Toast?"),
    ("Q14", "ask", "We do a $75 murder mystery dinner every Saturday. Can Tables handle that?"),
    ("Q15", "ask", "How is Tables ticketing different from Eventbrite or Tock?"),
    # Prepayments
    ("Q16", "ask", "How do prepayments work? Show me a real customer using them"),
    ("Q17", "ask", "We want to charge the full amount at booking for our tasting menu. Can we do that?"),
    # Training / qualification
    ("Q18", "train", "Teach me how to qualify a prospect in under 60 seconds"),
    ("Q19", "train", "Quiz me on the SevenRooms competitive objection"),
    ("Q20", "ask", "I'm about to call a wine bar in Chicago — walk me through the opening"),
]

PASS_SIGNALS = {
    "Q01": ["floor plan", "host app", "seat", "reservation queue", "iPad"],
    "Q02": ["check-in", "arrival", "floor", "host", "tap"],
    "Q03": ["configure", "service area", "pacing", "floor plan", "manager"],
    "Q04": ["60", "100", "full-service", "FSR", "covers", "POS", "OpenTable"],
    "Q05": ["transaction", "full-service", "FSR", "growth", "on-premise"],
    "Q06": ["60", "100", "cover"],
    "Q07": ["Music Box", "Cleveland"],
    "Q08": ["Music Box", "Cleveland", "prepay", "upfront", "murder mystery"],
    "Q09": ["Music Box", "Cleveland", "Midwest"],
    "Q10": ["bowling", "entertainment", "F&B", "CONFIRM"],
    "Q11": ["bowling", "F&B", "dining", "fit", "restaurant"],
    "Q12": ["Music Box", "murder mystery", "cooking class", "Tutto Tavola", "Black Cypress"],
    "Q13": ["experience", "Named Experience", "prepay", "confirmation", "host app"],
    "Q14": ["murder mystery", "Music Box", "prepay", "Named Experience", "$75"],
    "Q15": ["Tock", "Eventbrite", "link-out", "one system", "POS"],
    "Q16": ["Music Box", "Black Cypress", "Tutto Tavola", "prepay", "upfront"],
    "Q17": ["full prepay", "upfront", "tasting menu", "Named Experience", "yes"],
    "Q18": ["qualify", "60 second", "covers", "POS", "OpenTable", "reservation"],
    "Q19": ["SevenRooms", "POS", "Toast", "switching", "integration"],
    "Q20": ["wine bar", "Chicago", "opening", "qualify", "reservation"],
}

def ask(qid, mode, question):
    payload = json.dumps({
        "messages": [{"id": "1", "role": "user", "parts": [{"type": "text", "text": question}]}],
        "mode": mode
    }).encode()
    req = urllib.request.Request(BASE, data=payload,
                                  headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        # SSE stream: v7 data-protocol — extract text-delta events
        text = ""
        for line in raw.splitlines():
            if line.startswith("data: "):
                try:
                    obj = json.loads(line[6:])
                    if obj.get("type") == "text-delta":
                        text += obj.get("delta", "")
                except Exception:
                    pass
        return text.strip()
    except urllib.error.URLError as e:
        return f"ERROR: {e}"

def grade(qid, answer):
    signals = PASS_SIGNALS.get(qid, [])
    low = answer.lower()
    hits = [s for s in signals if s.lower() in low]
    return hits, len(hits) >= max(1, len(signals) // 2)

results = []
for qid, mode, question in QUESTIONS:
    print(f"\n{'='*60}\n{qid}: {question[:70]}")
    answer = ask(qid, mode, question)
    hits, passed = grade(qid, answer)
    status = "PASS" if passed else "FAIL"
    print(f"STATUS: {status}  hits={hits}")
    print(f"ANSWER (first 300 chars): {answer[:300]}")
    results.append({"qid": qid, "status": status, "hits": hits, "answer": answer[:500]})

print("\n\n=== SUMMARY ===")
passed = [r for r in results if r["status"] == "PASS"]
failed = [r for r in results if r["status"] == "FAIL"]
print(f"PASS: {len(passed)}/20  FAIL: {len(failed)}/20")
for r in failed:
    print(f"  FAIL {r['qid']} — hits={r['hits']}")