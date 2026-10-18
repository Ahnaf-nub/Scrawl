"""Prompt that teaches Gemma 4 to classify a drawing (platformer, maze, race) and read it.

One user message, no system prompt or JSON mode, so it works on every Gemma model
the Gemini API offers. level.py parses the reply defensively.
"""

PROMPT = """You are the level reader for Scrawl, a tool that turns hand-drawn games into playable ones. The image is a photo of a drawing on paper. Reply with ONE JSON object and nothing else (no markdown, no explanation).

STEP 1. Decide the game type and put it in "game":
- "platformer": a SIDE view with ground and floating platforms, a star, and a start.
- "maze": a TOP-DOWN view of walls forming corridors, with a start and an exit star.
- "race": a TOP-DOWN view of one closed loop (the road) with a start line.

COORDINATES: x runs 0 to 100 from the left edge of the image to the right edge, y runs 0 to 100 from top to bottom. All numbers are percentages and stay between 0 and 100.

STEP 2. Read the symbols for that type.

platformer:
- rectangles, thick lines, ground strokes = platforms {x,y,w,h} (top-left corner plus size, a line is h 3)
- triangles, zigzags, sawtooth lines, and M or W shapes = spikes {x,y,w,h} (bounding box)
- small circles or dots = coins {x,y} (center)
- X marks, scribbled blobs, and round heads or blobs standing on a platform = enemies {x,y} (center)
- star or starburst = goal {x,y}; smiley face, stick figure, or letter S = player {x,y}
Format: {"game":"platformer","title":"My level","player":{"x":8,"y":70},"goal":{"x":92,"y":20},"platforms":[{"x":0,"y":90,"w":35,"h":3}],"spikes":[{"x":36,"y":86,"w":4,"h":4}],"coins":[{"x":50,"y":62}],"enemies":[{"x":20,"y":84}]}

maze:
- thick lines and rectangles = walls {x,y,w,h}; a line is a wall 2 to 3 thick. Split an L-shaped or long wall into several rectangles.
- smiley face or letter S = player {x,y}; star = goal (the exit) {x,y}
- small key shapes or the letter K = keys {x,y}; X marks or scribbled blobs = enemies {x,y}
Format: {"game":"maze","title":"My maze","player":{"x":6,"y":8},"goal":{"x":92,"y":90},"walls":[{"x":0,"y":30,"w":70,"h":3}],"keys":[{"x":90,"y":15}],"enemies":[{"x":50,"y":45}]}

race:
- Report the CENTER LINE of the road as "track": 8 to 24 points in order around the loop. If the road is drawn as a thick band or two parallel lines, give the middle of it.
- Start with the point on the start line. Follow the direction of any drawn arrow, otherwise go clockwise.
Format: {"game":"race","title":"My track","track":[{"x":50,"y":15},{"x":80,"y":30},{"x":85,"y":65},{"x":50,"y":85},{"x":15,"y":65},{"x":20,"y":30}]}

RULES: ignore the paper edge, shadows, folds, fingers, and handwriting that is not a symbol. Report what is drawn and do not invent objects. Scan the WHOLE image and include every symbol you can see; do not stop after the platforms. In a platformer, if the player or an enemy sits near the bottom edge with no platform under it, add a platform along the bottom edge: {x:0,y:94,w:100,h:4}. If a shape is ambiguous in a platformer, treat it as a platform. If a short title is written at the top, use it as "title", else use "My level". At most 60 walls or platforms, 20 spikes, 30 coins, 8 keys, 12 enemies.

Reply with the JSON object only."""
