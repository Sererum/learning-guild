"""Trusted resource envelope. OS isolation is applied by execution-sandbox.mjs.

macOS does not enforce address-space/data limits reliably. Its resident watchdog
bounds sustained memory consumption but cannot prevent a short allocation peak.
"""
import os
import runpy
import sys
import threading
import time

try:
    import resource
except ImportError:
    if sys.platform != "win32":
        raise
    resource = None


def lower_limit(kind, value):
    soft, hard = resource.getrlimit(kind)
    limit = min(value, hard) if hard != resource.RLIM_INFINITY else value
    resource.setrlimit(kind, (limit, limit))


if resource is not None:
    lower_limit(resource.RLIMIT_CPU, 3)
    lower_limit(resource.RLIMIT_FSIZE, 2 * 1024 * 1024)
    lower_limit(resource.RLIMIT_NOFILE, 64)
    lower_limit(resource.RLIMIT_NPROC, 0)
    if sys.platform != "darwin":
        lower_limit(resource.RLIMIT_AS, 512 * 1024 * 1024)


def watch_memory():
    while True:
        resident = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        resident_bytes = resident if sys.platform == "darwin" else resident * 1024
        if resident_bytes > 512 * 1024 * 1024:
            os._exit(137)
        time.sleep(0.02)


if resource is not None:
    threading.Thread(target=watch_memory, daemon=True).start()


def block_child_processes(event, args):
    if (event.startswith("subprocess.") or event in {
        "os.system", "os.fork", "os.forkpty", "os.exec", "os.posix_spawn",
        "os.spawn", "pty.spawn",
    }):
        raise PermissionError("Запуск дополнительных процессов запрещён.")


sys.addaudithook(block_child_processes)
if sys.argv[-1:] == ["--probe"]:
    print("guild-sandbox-ready")
else:
    script, *arguments = sys.argv[1:]
    sys.argv = [script, *arguments]
    runpy.run_path(script, run_name="__main__")
