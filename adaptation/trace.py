"""Observe the existing restricted runner; never widen learner-code builtins."""
import contextlib
import ast
import importlib.util
import io
import json
import sys

spec = importlib.util.spec_from_file_location("guild_runner", sys.argv[1])
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
if "--inspect-starter" in sys.argv:
    try:
        payload = json.load(sys.stdin)
        names = set(payload["tests"][0]["inputs"])
        assigned = set()
        for node in ast.parse(payload["code"]).body:
            if not isinstance(node, (ast.Assign, ast.AnnAssign)):
                raise ValueError("В заготовке допустимы только исходные данные и комментарии.")
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if not isinstance(target, ast.Name) or target.id not in names or target.id in assigned:
                    raise ValueError("Заготовка должна содержать только исходные переменные, по одному присваиванию.")
                assigned.add(target.id)
            literal = ast.literal_eval(node.value)
            for target in targets:
                expected = payload["tests"][0]["inputs"][target.id]
                if type(literal) is not type(expected) or literal != expected:
                    raise ValueError("Исходные данные редактора должны совпадать с первым открытым примером.")
        if assigned != names:
            raise ValueError("В заготовке должны быть все входные переменные.")
        print(json.dumps({"ok": True}))
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
    sys.exit(0)
frames = []
previous = {}
occurrences = {}
loop_indices = {}
learner_exception = False
# Read once so explanations refer to the code actually executed by the runner.
payload = json.load(sys.stdin)
sys.stdin = io.StringIO(json.dumps(payload))
statements = {}
try:
    for node in ast.walk(ast.parse(payload["code"])):
        if isinstance(node, ast.stmt):
            statements.setdefault(node.lineno, node)
except SyntaxError:
    pass  # The restricted runner returns the actual syntax error.


def entered_body(node, next_line):
    return next_line is not None and any(
        child.lineno <= next_line <= child.end_lineno for child in node.body
    )


def describe(line, next_line, frame):
    """Describe observed control flow without evaluating a condition twice."""
    node = statements.get(line)
    if isinstance(node, (ast.For, ast.If, ast.While)) and node.body[0].lineno == line:
        return "Строка выполнена", "Условие или цикл и его тело записаны на одной строке. Показано состояние после выполнения всей строки."
    if isinstance(node, ast.For):
        key = (id(frame), line)
        if entered_body(node, next_line):
            index = loop_indices.get(key, 0)
            loop_indices[key] = index + 1
            names = [part.id for part in ast.walk(node.target) if isinstance(part, ast.Name)]
            values = ", ".join(f"{name} = {frame.f_locals[name]!r}" for name in names if name in frame.f_locals)
            return "Следующий элемент", f"Берём элемент с индексом {index} из {ast.unparse(node.iter)}: {values}. Тело цикла ещё не выполнено."
        loop_indices.pop(key, None)
        return "Перебор завершён", "Элементы закончились. Выходим из цикла; нового значения для переменной цикла нет."
    if isinstance(node, (ast.If, ast.While)):
        passed = entered_body(node, next_line)
        result = "True" if passed else "False"
        action = "Переходим к телу; его строки ещё не выполнены." if passed else "Пропускаем тело и идём дальше."
        return "Проверка условия", f"Проверка {ast.unparse(node.test)} дала {result}. {action}"
    if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
        return "Присваивание", "Строка выполнена. Справа показаны переменные после присваивания."
    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == "print":
        return "Вывод", "print() выполнен. Ниже показан весь вывод, накопленный к этому шагу."
    return "Строка выполнена", "Справа показано состояние после выполнения выделенной строки."


def observe(frame, event, arg):
    global learner_exception
    if frame.f_code.co_filename not in ("решение.py", "учебная_ячейка.py"):
        return observe
    key = id(frame)
    if event == "exception":
        # A failed statement is not an after-state. Never certify this run as
        # complete, even if learner code later catches the exception.
        learner_exception = True
        previous.pop(key, None)
        return observe
    if event not in ("line", "return"):
        return observe
    prior = previous.get(key)
    if prior is not None:
        occurrences[prior] = occurrences.get(prior, 0) + 1
        if len(frames) >= 2000:
            raise RuntimeError("Слишком длинная трассировка примера.")
        values = {name: runner.safe_value(value) for name, value in frame.f_locals.items()
                  if not name.startswith("__")}
        label, explanation = describe(prior, frame.f_lineno if event == "line" else None, frame)
        output = sys.stdout.getvalue() if hasattr(sys.stdout, "getvalue") else ""
        frames.append({"line": prior, "occurrence": occurrences[prior], "event": "after",
                       "variables": values, "output": output, "label": label,
                       "explanation": explanation})
    if event == "line":
        current = statements.get(frame.f_lineno)
        if isinstance(current, ast.For) and prior != frame.f_lineno and not entered_body(current, prior):
            # The same inner loop can be entered again after an early break.
            # Its element index starts at zero for that new traversal.
            loop_indices.pop((key, frame.f_lineno), None)
        previous[key] = frame.f_lineno
    else:
        previous.pop(key, None)
    return observe


captured = io.StringIO()
try:
    with contextlib.redirect_stdout(captured):
        sys.settrace(observe)
        runner.main()
except Exception as error:
    result = {"ok": False, "error": type(error).__name__ + ": " + str(error)}
else:
    result = json.loads(captured.getvalue())
finally:
    sys.settrace(None)
result["frames"] = frames
result["executionTrace"] = {"frames": frames, "complete": result.get("ok") is True and not learner_exception}
print(json.dumps(result, ensure_ascii=False))
