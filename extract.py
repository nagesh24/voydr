import json
import re

file_path = r"C:\Users\nages\.gemini\antigravity\brain\a305a518-c628-4bf5-ad35-e68c666f29c9\.system_generated\steps\182\content.md"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Find all substrings between quotation marks that are long (likely prompts or responses)
matches = re.findall(r'"([^"]{50,})"', content)

for match in matches:
    if "laptop" in match.lower() or "gsap" in match.lower() or "three" in match.lower() or "animation" in match.lower():
        print(match[:200] + "...\n")
