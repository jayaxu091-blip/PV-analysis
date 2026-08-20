from __future__ import annotations

import math
import pathlib

from PIL import Image, ImageDraw


IN_DIR = pathlib.Path("dataset_preview")
OUT_PATH = IN_DIR / "contact_sheet.jpg"


def main() -> None:
    files = sorted(IN_DIR.glob("*.jpg"))
    thumbs = []
    width, height = 240, 160

    for file in files:
        try:
            image = Image.open(file).convert("RGB")
        except Exception as error:
            print(f"skip {file}: {error}")
            continue
        image.thumbnail((width, height))
        tile = Image.new("RGB", (width, height + 30), "white")
        tile.paste(image, ((width - image.width) // 2, (height - image.height) // 2))
        ImageDraw.Draw(tile).text((4, height + 6), file.name[:34], fill=(0, 0, 0))
        thumbs.append(tile)

    cols = 3
    rows = math.ceil(len(thumbs) / cols)
    sheet = Image.new("RGB", (cols * width, rows * (height + 30)), (245, 245, 245))
    for index, tile in enumerate(thumbs):
        sheet.paste(tile, ((index % cols) * width, (index // cols) * (height + 30)))

    sheet.save(OUT_PATH)
    print(OUT_PATH.resolve())


if __name__ == "__main__":
    main()
