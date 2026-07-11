from pathlib import Path

ROOT = Path(__file__).parent.resolve()

IGNORE_DIRS = {
    "node_modules",
    "dist",
    ".git",
    ".github",
    ".idea",
    ".vscode",
    "coverage",
    "build",
    "bin",
    "obj",
    "out",
    "target",
    ".cache",
    "__pycache__",
    "AI_EXPORT",
}

IGNORE_FILES = {
    "export_context.py",
    "export_for_ai.py",
    "project_context.txt",
    "structure.txt",
    "manifest.csv",
}

IGNORE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico",
    ".mp4", ".avi", ".mov", ".mkv", ".webm",
    ".mp3", ".wav", ".ogg", ".flac",
    ".zip", ".rar", ".7z", ".tar", ".gz",
    ".exe", ".dll", ".so", ".dylib",
    ".woff", ".woff2", ".ttf", ".otf",
    ".pdf", ".psd", ".ai", ".blend",
    ".lock"
}

MAX_PART_SIZE = 10 * 1024 * 1024  # 10 MB

structure = []

for path in sorted(ROOT.rglob("*")):
    if any(part in IGNORE_DIRS for part in path.parts):
        continue

    rel = path.relative_to(ROOT)

    if path.is_dir():
        structure.append(str(rel) + "/")
    else:
        structure.append(str(rel))


header = "=" * 100 + "\n"
header += "PROJECT STRUCTURE\n"
header += "=" * 100 + "\n\n"

for item in structure:
    header += item + "\n"

header += "\n\n"
header += "=" * 100 + "\n"
header += "PROJECT FILES\n"
header += "=" * 100 + "\n\n"


part = 1
current_size = 0
outfile = None


def new_output():
    global outfile, current_size, part

    if outfile:
        outfile.close()

    filename = ROOT / f"project_context_{part:03d}.txt"
    outfile = open(filename, "w", encoding="utf-8")

    outfile.write(header)

    current_size = len(header.encode("utf-8"))
    part += 1


new_output()

for file in sorted(ROOT.rglob("*")):

    if not file.is_file():
        continue

    if any(part in IGNORE_DIRS for part in file.parts):
        continue

    if file.name in IGNORE_FILES:
        continue

    if file.name.startswith("project_context_"):
        continue

    if file.suffix.lower() in IGNORE_EXTENSIONS:
        continue

    try:
        text = file.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        try:
            text = file.read_text(encoding="utf-8-sig")
        except Exception:
            continue
    except Exception:
        continue

    rel = file.relative_to(ROOT)

    block = (
        "\n"
        + "#" * 100
        + "\nFILE: "
        + str(rel)
        + "\n"
        + "#" * 100
        + "\n\n"
        + text
        + "\n\n"
    )

    block_size = len(block.encode("utf-8"))

    if current_size + block_size > MAX_PART_SIZE:
        new_output()

    outfile.write(block)
    current_size += block_size

outfile.close()

print("=" * 60)
print("Kész!")
print(f"Létrehozott fájlok: {part - 1}")
print("=" * 60)