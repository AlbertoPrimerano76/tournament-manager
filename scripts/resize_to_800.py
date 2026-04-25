"""
Resize sponsor logo images to 800x800 with white padding.
Usage: python3 resize_to_800.py logo1.png logo2.png ...
Output files are saved as <name>_800.png in the same folder.
"""
import sys
from pathlib import Path
from PIL import Image

TARGET = 800

def resize(path: str) -> None:
    src = Path(path)
    img = Image.open(src).convert("RGBA")
    # Scale up OR down to fill TARGET×TARGET, keeping aspect ratio
    scale = min(TARGET / img.width, TARGET / img.height)
    new_w = int(img.width * scale)
    new_h = int(img.height * scale)
    img = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (TARGET, TARGET), (255, 255, 255, 255))
    x = (TARGET - img.width) // 2
    y = (TARGET - img.height) // 2
    canvas.paste(img, (x, y), img)
    out = src.with_stem(src.stem + "_800").with_suffix(".png")
    canvas.convert("RGB").save(out, "PNG")
    print(f"  {src.name} → {out.name} ({TARGET}x{TARGET})")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 resize_to_800.py image1.png image2.png ...")
        sys.exit(1)
    for p in sys.argv[1:]:
        resize(p)
    print("Done.")
