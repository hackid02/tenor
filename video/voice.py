# Voice-over: one audio file per line plus word timings, then timeline.json.
#   python voice.py
# Uses Microsoft's neural voices through edge-tts. Only the script text is sent.
import asyncio, json, os
import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "script.json"), encoding="utf8"))
OUT = os.path.join(HERE, "build", "voice")
os.makedirs(OUT, exist_ok=True)
LEAD = 0.6  # silence before the first line


async def say(i, text):
    words = []
    path = os.path.join(OUT, f"{i:02d}.mp3")
    com = edge_tts.Communicate(text, S["voice"], rate=S.get("rate", "+0%"), boundary="WordBoundary")
    with open(path, "wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"w": chunk["text"], "s": chunk["offset"] / 1e7, "e": (chunk["offset"] + chunk["duration"]) / 1e7})
    return path, words


async def main():
    t = LEAD
    lines = []
    for i, line in enumerate(S["lines"]):
        path, words = await say(i, line["text"])
        dur = words[-1]["e"] + 0.15
        lines.append({**line, "file": os.path.relpath(path, HERE).replace("\\", "/"), "start": round(t, 3), "end": round(t + dur, 3),
                      "words": [{"w": w["w"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3)} for w in words]})
        t += dur + S.get("gap", 0.4) + line.get("pause", 0)
    total = round(t + 2.4, 3)  # hold on the close
    json.dump({"duration": total, "lines": lines}, open(os.path.join(HERE, "build", "timeline.json"), "w", encoding="utf8"), indent=1)
    print(f"{len(lines)} lines, {total:.1f}s")


asyncio.run(main())
