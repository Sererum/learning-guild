"""Static, bounded editor diagnostics. Never execute or import learner code."""
import ast
import builtins
import json
import sys


class Scope:
    def __init__(self, parent=None, kind="module"):
        self.parent = parent
        self.kind = kind
        self.names = set()
        self.globals = set()
        self.nonlocals = set()
        self.dynamic = False

    def resolves(self, name):
        if name in self.globals:
            if name in self.names:
                return True
            scope = self
            while scope.parent:
                scope = scope.parent
            return name in scope.names or scope.dynamic or name in dir(builtins)
        if name in self.names and name not in self.nonlocals:
            return True
        if self.dynamic:
            return True
        parent = self.parent
        if self.kind in ("function", "comprehension"):
            while parent and parent.kind == "class":
                parent = parent.parent
        return parent.resolves(name) if parent else name in dir(builtins) or name in {"__name__", "__doc__", "__package__", "__builtins__"}


class Bindings(ast.NodeVisitor):
    def __init__(self, scope):
        self.scope = scope

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Store):
            self.scope.names.add(node.id)

    def visit_FunctionDef(self, node):
        self.scope.names.add(node.name)

    visit_AsyncFunctionDef = visit_FunctionDef
    visit_ClassDef = visit_FunctionDef

    def visit_Lambda(self, node):
        pass

    def visit_Import(self, node):
        self.scope.names.update(alias.asname or alias.name.split(".")[0] for alias in node.names)

    def visit_ImportFrom(self, node):
        if any(alias.name == "*" for alias in node.names):
            self.scope.dynamic = True
        self.scope.names.update(alias.asname or alias.name for alias in node.names)

    def visit_Global(self, node):
        self.scope.globals.update(node.names)

    def visit_Nonlocal(self, node):
        self.scope.nonlocals.update(node.names)

    def visit_ExceptHandler(self, node):
        if node.name:
            self.scope.names.add(node.name)
        self.generic_visit(node)

    def visit_MatchAs(self, node):
        if node.name:
            self.scope.names.add(node.name)
        self.generic_visit(node)

    visit_MatchStar = visit_MatchAs

    def visit_MatchMapping(self, node):
        if node.rest:
            self.scope.names.add(node.rest)
        self.generic_visit(node)

    def visit_Call(self, node):
        # Dynamic namespace operations cannot be resolved statically. Be quiet
        # instead of presenting a confident false error for exec/globals usage.
        if isinstance(node.func, ast.Name) and node.func.id in {"exec", "eval", "globals", "locals"}:
            self.scope.dynamic = True
        self.generic_visit(node)

    def visit_ListComp(self, node):
        # Comprehension targets are local; assignment expressions bind outside.
        for child in ast.walk(node):
            if isinstance(child, ast.NamedExpr):
                self.visit(child.target)

    visit_SetComp = visit_ListComp
    visit_DictComp = visit_ListComp
    visit_GeneratorExp = visit_ListComp


def bind(scope, body):
    visitor = Bindings(scope)
    for node in body:
        visitor.visit(node)


def parameters(scope, args):
    scope.names.update(arg.arg for arg in args.posonlyargs + args.args + args.kwonlyargs)
    for arg in (args.vararg, args.kwarg):
        if arg:
            scope.names.add(arg.arg)


class Analyzer(ast.NodeVisitor):
    def __init__(self, source):
        self.source = source
        self.lines = source.splitlines(keepends=True)
        self.scope = Scope()
        self.diagnostics = []

    def offset(self, line, column, byte_column=True):
        row = self.lines[min(max(line - 1, 0), len(self.lines) - 1)] if self.lines else ""
        prefix = row.encode("utf-8")[:column].decode("utf-8", errors="ignore") if byte_column else row[:column]
        return len(("".join(self.lines[:line - 1]) + prefix).encode("utf-16-le")) // 2

    def visit_Module(self, node):
        bind(self.scope, node.body)
        self.generic_visit(node)

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load) and not self.scope.resolves(node.id) and len(self.diagnostics) < 30:
            self.diagnostics.append({"kind": "undefined-name", "start": self.offset(node.lineno, node.col_offset), "end": self.offset(node.end_lineno, node.end_col_offset), "line": node.lineno, "message": f"Имя «{node.id}» не определено. Проверь написание или сначала сохрани в него значение."})

    def function(self, node):
        for value in node.decorator_list + node.args.defaults + [value for value in node.args.kw_defaults if value]:
            self.visit(value)
        # Annotations can be deferred/stringified and generic type parameters
        # have their own Python3.12 scope: do not guess their runtime meaning.
        parent = self.scope
        self.scope = Scope(parent, "function")
        parameters(self.scope, node.args)
        self.scope.names.update(param.name for param in getattr(node, "type_params", []))
        if parent.kind == "class":
            self.scope.names.add("__class__")
        bind(self.scope, node.body)
        for child in node.body:
            self.visit(child)
        self.scope = parent

    visit_FunctionDef = function
    visit_AsyncFunctionDef = function

    def visit_Lambda(self, node):
        for value in node.args.defaults + [value for value in node.args.kw_defaults if value]:
            self.visit(value)
        parent = self.scope
        self.scope = Scope(parent, "function")
        parameters(self.scope, node.args)
        bind(self.scope, [node.body])
        self.visit(node.body)
        self.scope = parent

    def visit_ClassDef(self, node):
        for value in node.decorator_list:
            self.visit(value)
        parent = self.scope
        type_names = {param.name for param in getattr(node, "type_params", [])}
        if type_names:
            self.scope = Scope(parent, "annotation")
            self.scope.names.update(type_names)
        for value in node.bases + [keyword.value for keyword in node.keywords]:
            self.visit(value)
        self.scope = Scope(self.scope, "class")
        self.scope.names.add("__class__")
        self.scope.names.update(type_names)
        bind(self.scope, node.body)
        for child in node.body:
            self.visit(child)
        self.scope = parent

    def visit_AnnAssign(self, node):
        self.visit(node.target)
        if node.value:
            self.visit(node.value)

    def visit_TypeAlias(self, node):
        pass

    def comprehension(self, node):
        parent = self.scope
        self.visit(node.generators[0].iter)
        self.scope = Scope(parent, "comprehension")
        for index, generator in enumerate(node.generators):
            if index:
                self.visit(generator.iter)
            Bindings(self.scope).visit(generator.target)
            for condition in generator.ifs:
                self.visit(condition)
        for value in ([node.key, node.value] if isinstance(node, ast.DictComp) else [node.elt]):
            self.visit(value)
        self.scope = parent

    visit_ListComp = comprehension
    visit_SetComp = comprehension
    visit_DictComp = comprehension
    visit_GeneratorExp = comprehension


def analyze(source):
    checker = Analyzer(source)
    try:
        # compile only validates syntax/context; the returned bytecode is discarded.
        compile(source, "<редактор>", "exec", dont_inherit=True)
        tree = ast.parse(source)
    except SyntaxError as error:
        line = min(error.lineno or 1, max(1, len(checker.lines)))
        row = checker.lines[line - 1] if checker.lines else ""
        column = min(max(0, (error.offset or 1) - 1), max(0, len(row.rstrip()) - 1))
        start = checker.offset(line, column, False)
        start = min(start, max(0, len(source.encode("utf-16-le")) // 2 - 1))
        end = checker.offset(error.end_lineno or line, max(error.offset or 1, (error.end_offset or error.offset or 1) - 1), False)
        detail = "Проверь отступы: внутри блока нужны одинаковые отступы." if isinstance(error, IndentationError) else "Проверь двоеточие, скобки, кавычки и запись этой строки."
        return [{"kind": "syntax", "start": start, "end": max(start + 1, end), "line": line, "message": "Ошибка записи Python. " + detail}]
    checker.visit(tree)
    return checker.diagnostics


try:
    payload = json.load(sys.stdin)
    source = payload.get("code")
    if not isinstance(source, str) or len(source) > 16000:
        raise ValueError("Code limit")
    print(json.dumps({"diagnostics": analyze(source)}, ensure_ascii=False))
except (ValueError, RecursionError, MemoryError):
    print(json.dumps({"diagnostics": [], "unavailable": True}))
