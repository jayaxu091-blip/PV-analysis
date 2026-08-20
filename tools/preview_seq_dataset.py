from __future__ import annotations

import pathlib
import zipfile


ZIP_PATH = pathlib.Path(r"C:\Users\jayax\Downloads\pole_vault.zip")
OUT_DIR = pathlib.Path("dataset_preview")


def jpeg_offsets(data: bytes) -> list[int]:
    offsets: list[int] = []
    index = 0
    while True:
        found = data.find(b"\xff\xd8", index)
        if found < 0:
            return offsets
        offsets.append(found)
        index = found + 2


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    with zipfile.ZipFile(ZIP_PATH) as archive:
        entries = [entry for entry in archive.infolist() if entry.filename.endswith(".seq")]
        print(f"seq_files,{len(entries)}")
        for entry in entries[:8]:
            data = archive.read(entry)
            starts = jpeg_offsets(data)
            print(f"{entry.filename},{len(starts)}")
            if not starts:
                continue
            picks = sorted(set([0, len(starts) // 2, len(starts) - 1]))
            for pick_index, frame_index in enumerate(picks, start=1):
                start = starts[frame_index]
                end = data.find(b"\xff\xd9", start)
                if end < 0:
                    continue
                output = OUT_DIR / f"{pathlib.Path(entry.filename).stem}_frame{pick_index}.jpg"
                output.write_bytes(data[start : end + 2])
                print(output)


if __name__ == "__main__":
    main()
