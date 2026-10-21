"""Ограниченный учебный исполнитель. Не является OS-песочницей для чужого кода."""
import ast
import contextlib
import io
import json
import sys

class BoundedOutput(io.StringIO):
    def write(self, value):
        if self.tell() + len(value) > 12000:
            raise RuntimeError("Слишком много вывода. Проверь, не повторяется ли цикл бесконечно.")
        return super().write(value)

def safe_value(value):
    if isinstance(value, set):
        return sorted(value, key=str)
    if isinstance(value, dict):
        return {str(k): safe_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [safe_value(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return "<неподдерживаемый результат>"

def track_report_prints(tree, required):
    """Track printed result dependencies without prescribing report wording.

    This is an educational dependency check, not proof of report semantics.
    Runtime tracking prevents a print in an unexecuted branch from qualifying.
    """
    aliases = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.Assign, ast.AnnAssign)) and node.value is not None:
            names = {part.id for part in ast.walk(node.value) if isinstance(part, ast.Name)}
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name):
                    aliases.setdefault(target.id, set()).update(names)

    def dependencies(node):
        pending = [part.id for part in ast.walk(node) if isinstance(part, ast.Name)]
        visited = set()
        while pending:
            name = pending.pop()
            if name in visited:
                continue
            visited.add(name)
            if name not in required:
                pending.extend(aliases.get(name, ()))
        return sorted(visited & required)

    class ReportPrints(ast.NodeTransformer):
        def visit_Call(self, node):
            self.generic_visit(node)
            if isinstance(node.func, ast.Name) and node.func.id == "print":
                deps = dependencies(node)
                node.func = ast.Name(id="__guild_report_print", ctx=ast.Load())
                node.args.insert(0, ast.Tuple(elts=[ast.Constant(value=name) for name in deps], ctx=ast.Load()))
            return node

    return ReportPrints().visit(tree)

def main():
    payload = json.load(sys.stdin)
    tree = ast.parse(payload["code"])
    # Running a cell is for exploration; pedagogical restrictions apply to tests.
    rules = (payload.get("constraints") or {}) if payload.get("mode") != "execute" else {}
    if rules:
        for_kind = sum(isinstance(node, ast.For) for node in ast.walk(tree))
        while_kind = sum(isinstance(node, ast.While) for node in ast.walk(tree))
        if (("forLoops" in rules and for_kind != rules["forLoops"])
                or ("whileLoops" in rules and while_kind != rules["whileLoops"])):
            expected_for = rules.get("forLoops", "без ограничения")
            expected_while = rules.get("whileLoops", "без ограничения")
            raise ValueError(f"В этой задаче нужны for: {expected_for}, while: {expected_while}. Тренируем именно этот способ решения.")
        def inspect_steps(node, depth=0):
            if isinstance(node, (ast.For, ast.While)):
                depth += 1
            if "maxLoopDepth" in rules and depth > rules["maxLoopDepth"]:
                raise ValueError("Здесь не нужен вложенный перебор. Расположи проходы по данным друг за другом.")
            for child in ast.iter_child_nodes(node):
                inspect_steps(child, depth)
        inspect_steps(tree)
        # Older algorithm tasks imply the elementary-loop style by declaring
        # loop limits. Other courses can specify only the constraints they need.
        forbid_abstractions = rules.get("forbidAbstractions", any(
            key in rules for key in ("forLoops", "whileLoops", "maxLoopDepth")
        ))
        for node in ast.walk(tree):
            if forbid_abstractions and isinstance(node, (ast.FunctionDef, ast.Lambda, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
                raise ValueError("В этой практике используем обычные циклы без функций и сокращённых записей.")
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id in rules.get("forbiddenCalls", ()):
                    raise ValueError(f"{node.func.id}() здесь заменяет изучаемый алгоритм. Напиши шаги обычным циклом.")
                if isinstance(node.func, ast.Attribute) and node.func.attr in rules.get("forbiddenMethods", ()):
                    raise ValueError(f"Метод .{node.func.attr}() в этой задаче не нужен: тренируем ручной проход.")
            if rules.get("forbidIn") and isinstance(node, (ast.In, ast.NotIn)):
                raise ValueError("В этой задаче сравнивай целое окно с маркером, без поиска через in.")
            if rules.get("forbidReverseSlice") and isinstance(node, ast.Slice) and isinstance(node.step, ast.UnaryOp) and isinstance(node.step.op, ast.USub):
                raise ValueError("В этой задаче сравнивай края двумя указателями без разворота срезом.")
    denied = (ast.Import, ast.ImportFrom, ast.ClassDef, ast.AsyncFunctionDef, ast.Global, ast.Nonlocal)
    for node in ast.walk(tree):
        if isinstance(node, denied):
            raise ValueError("В этом учебном демо импорты, классы и глобальные объявления не нужны.")
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            raise ValueError("Служебные атрибуты недоступны в учебном демо.")
        if isinstance(node, ast.Name) and node.id.startswith("__"):
            raise ValueError("Служебные имена недоступны в учебном демо.")
    allowed = {"print": print, "len": len, "set": set, "dict": dict, "list": list, "str": str, "repr": repr,
               "int": int, "float": float, "bool": bool, "range": range, "enumerate": enumerate,
               "sum": sum, "min": min, "max": max, "sorted": sorted, "abs": abs, "round": round,
               "zip": zip, "True": True, "False": False, "None": None}
    if payload.get("mode") == "execute":
        output = BoundedOutput()
        try:
            with contextlib.redirect_stdout(output):
                exec(compile(tree, "учебная_ячейка.py", "exec"), {"__builtins__": allowed})
            print(json.dumps({"kind": "execution", "ok": True, "output": output.getvalue()}, ensure_ascii=False))
        except Exception as error:
            print(json.dumps({"kind": "execution", "ok": False, "error": type(error).__name__ + ": " + str(error), "output": output.getvalue()}, ensure_ascii=False))
        return
    # Стартовые присваивания выполняются только из набора теста: хардкод в решении проверяется другими входами.
    inputs = set(payload["tests"][0]["inputs"])
    body = list(tree.body)
    while body and isinstance(body[0], (ast.Assign, ast.AnnAssign)):
        node = body[0]
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        if all(isinstance(t, ast.Name) and t.id in inputs for t in targets):
            try:
                ast.literal_eval(node.value)
            except (ValueError, TypeError, SyntaxError):
                break
            body.pop(0)
        else:
            break
    tree.body = body
    required_prints = set(rules.get("requiredPrintVariables", []))
    if required_prints:
        tree = track_report_prints(tree, required_prints)
    code = compile(ast.fix_missing_locations(tree), "решение.py", "exec")
    results = []
    for test in payload["tests"]:
        namespace = {"__builtins__": allowed, **test["inputs"]}
        output = BoundedOutput()
        printed_variables = set()
        def report_print(dependencies, *args, **kwargs):
            printed_variables.update(dependencies)
            print(*args, **kwargs)
        if required_prints:
            namespace["__guild_report_print"] = report_print
        try:
            with contextlib.redirect_stdout(output):
                exec(code, namespace)
            mismatches = []
            for key, expected in test["expected"].items():
                actual = namespace.get(key, "<переменная не создана>")
                if key in test.get("sets", []):
                    equal = isinstance(actual, set) and actual == set(expected)
                else:
                    numeric = (type(actual) in (int, float) and type(expected) in (int, float))
                    equal = (numeric or type(actual) is type(expected)) and actual == expected
                if not equal:
                    mismatches.append({"variable": key, "expected": expected, "actual": safe_value(actual)})
            printed = bool(output.getvalue())
            missing_prints = sorted(required_prints - printed_variables)
            actual_values = {key: safe_value(namespace.get(key, "<переменная не создана>")) for key in test["expected"]}
            note = "Добавь требуемый вывод через print()." if not printed else "Покажи в итоговом отчёте: " + ", ".join(missing_prints) + "." if missing_prints else ""
            results.append({"label": test["label"], "ok": not mismatches and printed and not missing_prints, "mismatches": mismatches, "actualValues": actual_values,
                            "output": output.getvalue(), "note": note})
        except Exception as error:
            results.append({"label": test["label"], "ok": False, "error": type(error).__name__ + ": " + str(error), "output": output.getvalue()})
    print(json.dumps({"ok": all(r["ok"] for r in results), "tests": results}, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": type(error).__name__ + ": " + str(error)}, ensure_ascii=False))
