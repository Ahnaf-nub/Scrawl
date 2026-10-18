# Drawing symbols

| Drawn as | Becomes | Fields |
|---|---|---|
| Rectangle, thick line, ground stroke | `platforms` | `x`, `y`, `w`, `h` (top-left plus size). A plain line uses `h: 3`. |
| Triangle | `spikes` | `x`, `y`, `w`, `h` of the bounding box |
| Small circle or dot | `coins` | `x`, `y` (center) |
| Star | `goal` | `x`, `y` (center). Exactly one. |
| Smiley face, stick figure, or the letter S | `player` | `x`, `y` (center). Exactly one. |
| Scribbled blob, X, angry face | `enemies` | `x`, `y` (center) |

All numbers are percentages of the image (0 to 100), origin at the top-left.
