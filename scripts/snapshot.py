#!/usr/bin/env python3
"""REV snapshot — pulls the public otcdesks.cash revenue feed and writes data/live.json
for the desk to read. No secrets, no auth, stdlib only. Run by .github/workflows/refresh.yml
on a schedule; safe to run by hand."""
import json, os, subprocess, urllib.request

URL = "https://otcdesks.cash/api/revenue"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "live.json")
LAM = 1e9
DEC = 1e6


def get():
    req = urllib.request.Request(URL, headers={"User-Agent": "otcrev.cash snapshot/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:  # local macOS Pythons often lack a CA bundle; curl has one
        r = subprocess.run(["curl", "-sS", "--max-time", "60", "-H", "User-Agent: otcrev.cash snapshot/1.0", URL], capture_output=True, text=True)
        if r.returncode != 0 or not r.stdout.strip():
            raise RuntimeError(f"{e}; curl: {r.stderr.strip()[:200]}")
        return json.loads(r.stdout)


def sol(v): return round((v or 0) / LAM, 4)
def otc(v): return round((v or 0) / DEC, 2)


def main():
    d = get()
    s, b, k, o, v = d["sol"], d["buyback"], d["desks"], d["otc"], d["volume"]
    out = {
        "at": d["at"],
        "sol": {x: sol(s.get(x)) for x in ("earned", "distributed", "toPot", "toProtocol", "toBuyback", "costs")},
        "buyback": {"spent": sol(b.get("spent")), "bought": otc(b.get("bought")), "burned": otc(b.get("burned")),
                    "buys": b.get("buys", 0), "burns": b.get("burns", 0), "holding": otc(b.get("holding")), "firstAt": b.get("firstAt")},
        "desks": {"burned": otc(k.get("burned")), "count": k.get("count", 0)},
        "otc": {"usdPrice": o.get("usdPrice"), "marketCap": o.get("marketCap"), "change24h": o.get("change24h")},
        "volume": {"d1": v.get("d1"), "d7": v.get("d7"), "all": v.get("all")},
        "daily": [{"day": x["day"], "earned": sol(x.get("earned")), "toHolders": sol(x.get("toHolders")), "toProtocol": sol(x.get("toProtocol")),
                   "toBuyback": sol(x.get("toBuyback")), "toPot": sol(x.get("toPot")), "spent": sol(x.get("spent")),
                   "bought": otc(x.get("bought")), "burned": otc(x.get("burned"))} for x in d.get("daily", [])],
        "recent": [{"kind": x["kind"], "at": x["at"], "sol": sol(x.get("sol")), "otc": otc(x.get("otc")), "sig": x.get("signature")} for x in d.get("recent", [])],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {OUT}: earned {out['sol']['earned']} SOL, {len(out['daily'])} days, {len(out['recent'])} recent")


if __name__ == "__main__":
    main()
