#!/usr/bin/env python3
"""
QA runner for Tables Rep Assist — sends all 20 adversarial questions to
the live /api/chat endpoint and records pass/fail with response text.

Usage:
  python3 scripts/qa_runner.py                          # with Dorchester account
  python3 scripts/qa_runner.py --no-account             # no account context (Q1-Q3 retest)
  python3 scripts/qa_runner.py --questions 1,2,3        # specific questions only
"""

import json
import sys
import argparse
import urllib.request
import urllib.error
import time

BASE_URL = "http://localhost:3000"

REP_CONTEXT = {
    "rep_name": "Tanguy Delannoy",
    "team": "Inside Sales",
    "region": "Inside - Avantini",
}

ACCOUNT_CONTEXT = {
    "name": "The Dorchester Supper Club",
    "city": "Dorchester",
    "state": "IA",
    "activation_status": "Backlog",
    "current_booking_platform": "None",
    "bookings_90d": 0,
    "chorus_calls": [
        {
            "call_date": "2026-06-18",
            "summary": "Toast POS system proposed for The Dorchester Supper Club with August 1st launch target date. Reservation Pro offered free for six months trial; includes unlimited reservations, deposits, and cancellation fees. Tanguy to send updated quote with Scheduling Pro included to Sarah. Sarah to forward final quote and documents to Nadine for approval.",
            "action_items": "[\"Tanguy to send updated quote with Scheduling Pro included to Sarah\",\"Sarah to forward final quote and documents to Nadine for approval\",\"Sarah to obtain voided check and owner information from Nadine and business partner\",\"Tanguy to schedule follow-up meeting with Sarah in five months to review Reservation Pro\"]",
        },
        {
            "call_date": "2026-06-16",
            "summary": "The Dorchester Supper Club plans to open by August 1st. Nadine Whalen is the operating partner. Fine dining supper club open daily except Tuesdays. No reservations except parties over 8. Seating capacity 140. Toast pricing estimated at $400-650 monthly.",
            "action_items": "[\"Tanguy to prepare detailed pricing proposal for Toast services and features\",\"Sarah and Nadine to review pricing proposal and make decision by Thursday\",\"Tanguy to introduce Sarah to Caitlin, the growth representative for ongoing support\"]",
        },
    ],
}

QUESTIONS = {
    1:  ("Host App", "Walk me through how the host app works at a restaurant"),
    2:  ("Host App", "What does a host see when a guest arrives for their reservation?"),
    3:  ("Host App", "Train me on the host app — how does a manager configure it?"),
    4:  ("Customer Profile", "What does a typical Tables customer look like?"),
    5:  ("Customer Profile", "Describe the profile of restaurants that are most successful with Tables"),
    6:  ("Customer Profile", "How many covers a night does a typical Tables restaurant do?"),
    7:  ("Geographic", "Do you have a customer in Cleveland?"),
    8:  ("Geographic", "Do you have a customer in Cleveland running a prepaid experience?"),
    9:  ("Geographic", "Show me a Midwest restaurant using Tables for something special"),
    10: ("Entertainment", "Do you have any entertainment venues using Tables — like a bowling alley or arcade bar?"),
    11: ("Entertainment", "We're a bowling alley with a restaurant attached. Are we a good fit?"),
    12: ("Entertainment", "What's an example of a non-traditional restaurant using Tables?"),
    13: ("Ticketed Events", "What does a ticketed event look like on Toast?"),
    14: ("Ticketed Events", "We do a $75 murder mystery dinner every Saturday. Can Tables handle that?"),
    15: ("Ticketed Events", "How is Tables ticketing different from Eventbrite or Tock?"),
    16: ("Prepayments", "How do prepayments work? Show me a real customer using them"),
    17: ("Prepayments", "We want to charge the full amount at booking for our tasting menu. Can we do that?"),
    18: ("Training", "Teach me how to qualify a prospect in under 60 seconds"),
    19: ("Training", "Quiz me on the SevenRooms competitive objection"),
    20: ("Training", "I'm about to call a wine bar in Chicago — walk me through the opening"),
}

# Pass criteria keywords — at least one from each list must appear (case-insensitive)
PASS_CRITERIA = {
    1:  ["host app", "floor plan", "reservation queue", "check-in", "seat", "walk-in"],
    2:  ["host app", "check in", "arrives", "seat", "floor plan", "queue"],
    3:  ["configure", "service area", "floor plan", "pacing", "manager", "setup"],
    4:  ["60", "100", "cover", "full-service", "FSR", "toast pos", "open table", "openTable", "per-cover"],
    5:  ["full-service", "FSR", "toast pos", "covers", "dining", "icp", "qualified"],
    6:  ["60", "100", "cover", "typical", "median"],
    7:  ["music box", "cleveland", "ohio", "OH"],
    8:  ["music box", "cleveland", "prepay", "prepayment", "upfront", "full payment"],
    9:  ["music box", "cleveland", "midwest", "special", "supper club", "experience"],
    10: ["horse", "axe", "entertainment", "bowling", "f&b", "experiential", "music box"],
    11: ["f&b", "dining", "restaurant", "fit", "entertainment", "scope", "bowling"],
    12: ["horse", "axe", "music box", "entertainment", "experiential", "non-traditional"],
    13: ["named experience", "experience", "ticketed", "prepay", "confirm", "check in", "murder mystery"],
    14: ["yes", "can", "named experience", "murder mystery", "ticketed", "$75", "prepay"],
    15: ["eventbrite", "tock", "one system", "toast", "integrated", "no reconciliation", "reconciliation"],
    16: ["black cypress", "tutto", "music box", "prepay", "full payment", "upfront"],
    17: ["yes", "can", "prepay", "full", "tasting menu", "upfront", "black cypress"],
    18: ["qualify", "fsr", "full-service", "covers", "toast pos", "pacing", "icp", "60 seconds", "signal"],
    19: ["sevenrooms", "seven rooms", "objection", "price", "per cover", "integrated", "toast"],
    20: ["inside", "pricing", "$199", "wine bar", "chicago", "opening", "tasting"],
}


def ask(question: str, with_account: bool = True) -> str:
    """POST to /api/chat and return the full streamed text response."""
    payload = {
        "messages": [
            {"role": "user", "parts": [{"type": "text", "text": question}]}
        ],
        "repContext": REP_CONTEXT,
    }
    if with_account:
        payload["accountContext"] = ACCOUNT_CONTEXT

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/chat",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    chunks = []
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            while True:
                chunk = resp.read(1024)
                if not chunk:
                    break
                chunks.append(chunk.decode("utf-8", errors="replace"))
    except urllib.error.URLError as e:
        return f"[ERROR: {e}]"

    raw = "".join(chunks)

    # AI SDK streaming format: lines like 0:"text chunk" or f:{"finishReason":...}
    # Extract all type-0 (text) chunks
    text_parts = []
    for line in raw.split("\n"):
        line = line.strip()
        if line.startswith('0:"') or line.startswith("0:'"):
            # Unescape the JSON string value
            try:
                inner = json.loads("{\"t\":" + line[2:] + "}")
                text_parts.append(inner["t"])
            except Exception:
                text_parts.append(line[3:-1])  # fallback: strip 0:" and "

    if text_parts:
        return "".join(text_parts)

    # Fallback: try to find plain text in the stream
    return raw[:2000]


def score(q_num: int, response: str) -> tuple[bool, str]:
    """Return (passed, reason)."""
    criteria = PASS_CRITERIA.get(q_num, [])
    resp_lower = response.lower()
    matched = [kw for kw in criteria if kw.lower() in resp_lower]
    if not matched:
        return False, f"None of {criteria[:3]}... found in response"
    return True, f"Matched: {matched[:3]}"


def run_qa(question_nums: list[int], with_account: bool = True):
    results = []
    label = "WITH account" if with_account else "NO account"
    print(f"\n{'='*70}")
    print(f"Tables Rep Assist QA — {label} context")
    print(f"{'='*70}\n")

    for q_num in question_nums:
        category, question = QUESTIONS[q_num]
        print(f"Q{q_num:02d} [{category}] {question}")
        print("  Asking...", end="", flush=True)

        start = time.time()
        response = ask(question, with_account=with_account)
        elapsed = time.time() - start

        passed, reason = score(q_num, response)
        status = "PASS" if passed else "FAIL"
        print(f"\r  [{status}] ({elapsed:.1f}s) {reason}")

        # Print first 200 chars of response for manual review
        preview = response[:300].replace("\n", " ").strip()
        if len(response) > 300:
            preview += "..."
        print(f"  Response preview: {preview}")
        print()

        results.append({
            "q": q_num,
            "category": category,
            "question": question,
            "passed": passed,
            "reason": reason,
            "response": response,
            "elapsed": round(elapsed, 1),
        })

        # Small pause between questions to be polite to the API
        time.sleep(1)

    # Summary
    passed_count = sum(1 for r in results if r["passed"])
    total = len(results)
    print(f"\n{'='*70}")
    print(f"RESULTS: {passed_count}/{total} passed")
    print(f"{'='*70}")

    fails = [r for r in results if not r["passed"]]
    if fails:
        print(f"\nFAILED ({len(fails)}):")
        for r in fails:
            print(f"  Q{r['q']:02d} [{r['category']}]: {r['question'][:60]}")
            print(f"       Reason: {r['reason']}")

    # Write full results to JSON for inspection
    out_path = "/tmp/qa_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results written to {out_path}")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-account", action="store_true", help="Run without account context")
    parser.add_argument("--questions", type=str, help="Comma-separated question numbers, e.g. 1,2,3")
    args = parser.parse_args()

    if args.questions:
        nums = [int(x.strip()) for x in args.questions.split(",")]
    else:
        nums = list(range(1, 21))

    with_account = not args.no_account
    run_qa(nums, with_account=with_account)
