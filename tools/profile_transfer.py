"""Trusted profile transport; stdlib only. Never executes archive contents."""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile
import zipfile

MAX_FILES = 20000
MAX_TOTAL = 256 * 1024 * 1024
MAX_FILE = 32 * 1024 * 1024
MANIFEST = "guild-profile-manifest.json"
ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
DENIED = re.compile(r"(^|[._-])(auth|oauth|token|tokens|secret|secrets|credential|credentials|password|passwords)([._-]|$)", re.I)
EXCLUDED = {".guild-lock.json", "execution-settings.json"}


def safe_name(name):
    if not isinstance(name, str) or not name or "\\" in name or ":" in name or any(ord(c) < 32 for c in name):
        raise ValueError("Недопустимый путь в архиве")
    parts = name.split("/")
    if any(p in ("", ".", "..") for p in parts) or PurePosixPath(name).is_absolute():
        raise ValueError("Небезопасный путь в архиве")
    for part in parts:
        if part.lower().startswith(".env") or part.lower().endswith((".pem", ".key", ".p12", ".pfx")) or part.lower() in {".ssh", ".aws", ".codex", "id_rsa", "id_ed25519"} or DENIED.search(part):
            raise ValueError("Обнаружено подозрительное имя файла; перенос остановлен")
    return name


def excluded(name):
    parts = name.split("/")
    return any(p in EXCLUDED or p in {"tmp", "temp", ".cache", "__pycache__"} or p.endswith((".tmp", ".temp", ".swp", ".lock")) or p.startswith(".guild-transfer-") for p in parts)


def binding(data):
    if not isinstance(data, dict) or type(data.get("version")) is not int or data.get("version") != 1 or any(not isinstance(data.get(k), str) or not ID.fullmatch(data[k]) for k in ("courseId", "profileId")):
        raise ValueError("Некорректная привязка курса/профиля")
    return data


def parse_json(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise ValueError("Повторяющийся ключ JSON")
            value[key] = item
        return value
    return json.loads(raw, object_pairs_hook=pairs)


def regular(path):
    mode = path.lstat().st_mode
    if not stat.S_ISREG(mode):
        raise ValueError("Разрешены только обычные файлы без ссылок")


def walk_profile(root):
    result = []
    seen = set()
    for current, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            target = Path(current) / name
            rel = target.relative_to(root).as_posix()
            safe_name(rel)
            mode = target.lstat().st_mode
            if stat.S_ISLNK(mode) or not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
                raise ValueError("В профиле найдена ссылка или специальный файл")
            if excluded(rel):
                continue
            if rel.casefold() in seen:
                raise ValueError("Имена файлов конфликтуют без учёта регистра")
            seen.add(rel.casefold())
            if stat.S_ISREG(mode):
                result.append((rel, target))
        dirs[:] = [d for d in dirs if not excluded((Path(current) / d).relative_to(root).as_posix())]
    return result


def export_profile(state, output):
    if stat.S_ISLNK(state.parent.lstat().st_mode):
        raise ValueError("Папка профиля не должна быть ссылкой")
    regular(state)
    root = state.parent.resolve()
    if root == root.parent or state.name == "profile.json":
        raise ValueError("Укажите файл прогресса внутри отдельной папки профиля")
    output = output.parent.resolve() / output.name
    if output == root or root in output.parents:
        raise ValueError("Архив нужно сохранить вне папки профиля")
    if os.path.lexists(output):
        raise ValueError("Выходной архив уже существует")
    entries = walk_profile(root)
    if len(entries) > MAX_FILES:
        raise ValueError("Слишком много файлов профиля")
    names = {name for name, _ in entries}
    if "profile.json" not in names or state.name not in names:
        raise ValueError("Нужны profile.json и файл прогресса")
    profile = binding(parse_json((root / "profile.json").read_bytes()))
    if not isinstance(parse_json(state.read_bytes()), dict):
        raise ValueError("Прогресс должен быть объектом JSON")
    manifest = {"format": "learning-guild-profile", "version": 1, "binding": profile, "stateFile": state.name, "files": {}}
    fd, tmp_name = tempfile.mkstemp(prefix=".guild-transfer-", suffix=".zip", dir=output.parent)
    os.close(fd)
    total = 0
    try:
        with zipfile.ZipFile(tmp_name, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, target in entries:
                regular(target)
                if target.stat().st_size > MAX_FILE:
                    raise ValueError("Файл профиля слишком велик")
                raw = target.read_bytes()
                total += len(raw)
                if total > MAX_TOTAL:
                    raise ValueError("Профиль превышает лимит размера")
                manifest["files"][name] = {"size": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
                archive.writestr("profile/" + name, raw)
            manifest_raw = json.dumps(manifest, ensure_ascii=False).encode("utf8")
            if len(manifest_raw) > MAX_FILE or total + len(manifest_raw) > MAX_TOTAL:
                raise ValueError("Манифест и профиль превышают лимит размера")
            archive.writestr(MANIFEST, manifest_raw)
        if Path(tmp_name).stat().st_size > MAX_TOTAL:
            raise ValueError("Архив превышает лимит размера")
        # Hard-link creation is atomic and cannot replace an existing archive.
        os.link(tmp_name, output)
    finally:
        Path(tmp_name).unlink(missing_ok=True)
    return {"archive": str(output), "files": len(entries), "bytes": total, "binding": profile, "browserDraftsIncluded": False}


def rename_exclusive(source, destination):
    # os.rename on POSIX can replace an empty directory. Use the native
    # no-replace primitive, without a race between existence check and rename.
    if sys.platform == "win32":
        os.rename(source, destination)
        return
    libc = ctypes.CDLL(None, use_errno=True)
    if sys.platform == "darwin" and hasattr(libc, "renamex_np"):
        call = libc.renamex_np
        call.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
        result = call(os.fsencode(source), os.fsencode(destination), 4)  # RENAME_EXCL
    elif sys.platform.startswith("linux") and hasattr(libc, "renameat2"):
        call = libc.renameat2
        call.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        result = call(-100, os.fsencode(source), -100, os.fsencode(destination), 1)
    else:
        raise ValueError("Нет безопасной атомарной публикации папки на этой системе")
    if result:
        number = ctypes.get_errno()
        raise OSError(number, os.strerror(number))


def import_profile(archive_path, destination):
    regular(archive_path)
    if archive_path.stat().st_size > MAX_TOTAL:
        raise ValueError("Архив превышает лимит размера")
    if os.path.lexists(destination):
        raise ValueError("Папка назначения уже существует; перезапись запрещена")
    destination = destination.parent.resolve(strict=True) / destination.name
    if destination.name in ("", ".", ".."):
        raise ValueError("Некорректная папка назначения")
    stage = None
    try:
        with zipfile.ZipFile(archive_path) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_FILES + 1:
                raise ValueError("Слишком много записей ZIP")
            seen = set()
            total = 0
            for info in infos:
                safe_name(info.filename)
                if info.filename.casefold() in seen:
                    raise ValueError("Повторяющийся путь в ZIP")
                seen.add(info.filename.casefold())
                mode = info.external_attr >> 16
                if info.is_dir() or (stat.S_IFMT(mode) not in (0, stat.S_IFREG)) or info.flag_bits & 1 or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                    raise ValueError("Ссылка, каталог или неподдерживаемая запись ZIP")
                if info.file_size > MAX_FILE:
                    raise ValueError("Запись ZIP слишком велика")
                total += info.file_size
                if total > MAX_TOTAL:
                    raise ValueError("Распакованный ZIP превышает лимит размера")
            manifest = parse_json(archive.read(MANIFEST))
            if not isinstance(manifest, dict) or manifest.get("format") != "learning-guild-profile" or type(manifest.get("version")) is not int or manifest.get("version") != 1:
                raise ValueError("Неизвестная схема ZIP профиля")
            profile = binding(manifest.get("binding"))
            files = manifest.get("files")
            state = safe_name(manifest.get("stateFile"))
            if "/" in state or not isinstance(files, dict) or "profile.json" not in files or state not in files or len(files) > MAX_FILES:
                raise ValueError("Некорректный манифест файлов")
            expected = {MANIFEST} | {"profile/" + safe_name(name) for name in files}
            if {info.filename for info in infos} != expected:
                raise ValueError("Список файлов ZIP не совпадает с манифестом")
            stage = Path(tempfile.mkdtemp(prefix=".guild-transfer-", dir=destination.parent))
            for name, descriptor in files.items():
                if excluded(name) or not isinstance(descriptor, dict) or type(descriptor.get("size")) is not int or descriptor["size"] < 0 or not re.fullmatch(r"[a-f0-9]{64}", str(descriptor.get("sha256", ""))):
                    raise ValueError("Запрещённый файл или некорректное описание файла")
                raw = archive.read("profile/" + name)
                if len(raw) != descriptor["size"] or hashlib.sha256(raw).hexdigest() != descriptor["sha256"]:
                    raise ValueError("Не совпадает размер или SHA-256 файла")
                target = stage / name
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("xb") as handle:
                    handle.write(raw)
            if binding(parse_json((stage / "profile.json").read_bytes())) != profile or not isinstance(parse_json((stage / state).read_bytes()), dict):
                raise ValueError("Привязка или прогресс не совпадает с манифестом")
            (stage / "execution-settings.json").write_text('{"mode":"isolated"}\n', encoding="utf8")
            # Recheck directly before publication; staging and destination share a filesystem.
            if os.path.lexists(destination):
                raise ValueError("Папка назначения уже существует; перезапись запрещена")
            rename_exclusive(stage, destination)
            stage = None
        return {"destination": str(destination), "stateFile": str(destination / state), "binding": profile, "files": len(files), "executionMode": "isolated", "browserDraftsIncluded": False}
    finally:
        if stage is not None:
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="action", required=True)
    ex = sub.add_parser("export")
    ex.add_argument("--state-file", required=True)
    ex.add_argument("--output", required=True)
    im = sub.add_parser("import")
    im.add_argument("--archive", required=True)
    im.add_argument("--destination", required=True)
    args = parser.parse_args()
    result = export_profile(Path(args.state_file), Path(args.output)) if args.action == "export" else import_profile(Path(args.archive), Path(args.destination))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Перенос остановлен: " + str(error), file=sys.stderr)
        sys.exit(1)
