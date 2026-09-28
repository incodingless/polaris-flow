#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
代码审查静态分析器（AST 版）—— 零依赖，仅用 Python 标准库。

相比正则版（analyze.sh）的核心改进：
  1. 基于 AST 结构分析，而非字符串匹配，大幅减少误报；
  2. 精确判断 subprocess 的 shell=True（不再误报 shell=False 的安全写法）；
  3. 新增函数级指标：函数行数、圈复杂度、嵌套深度；
  4. 检测未使用函数/导入（死代码）。

用法:
  python3 analyze.py [目标路径] [--diff] [--maxdepth N] [--maxfiles N] [--json]
  目标路径可为单个 .py 文件或目录（递归扫描 .py 文件）。
"""
import ast
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# ==================== 阈值常量 ====================
LONG_FUNC_LINES = 50       # 超长函数行数阈值
LARGE_FILE_LINES = 500     # 超大文件行数阈值
MAX_NESTING = 4            # 最大嵌套深度
MAX_COMPLEXITY = 10        # 圈复杂度阈值
EXCLUDE_DIRS = {
    '.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build',
    'vendor', 'target', '.next', 'coverage', '.idea', '.vscode', 'site-packages',
}

# ==================== 常量 ====================
SQL_KEYWORDS = ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER',
                'CREATE', 'WHERE', 'FROM', 'JOIN', 'TRUNCATE')
SECRET_HINTS = ('password', 'passwd', 'pwd', 'secret', 'apikey', 'apitoken',
                'accesstoken', 'refreshtoken', 'authtoken', 'bearertoken',
                'privatekey', 'accesskey', 'secretkey', 'dbpassword', 'databasepassword')

MAGIC_ALLOWED = {0, 1, -1, 2, 10, 100, 1000, 24, 60, 3600, 1024}


# ==================== 工具函数 ====================
def get_constant(node):
    """兼容 py3.8 ast.Constant 与旧版 ast.Str/ast.Num"""
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Str):      # py < 3.8
        return node.s
    if isinstance(node, ast.Num):      # py < 3.8
        return node.n
    if isinstance(node, ast.Bytes):
        return node.s
    return None


def get_string(node):
    v = get_constant(node)
    return v if isinstance(v, str) else None


def has_sql(text):
    upper = text.upper()
    for kw in SQL_KEYWORDS:
        if re.search(r'\b' + re.escape(kw) + r'\b', upper):
            return True
    return False


# SQL 执行/包装函数：仅在这些上下文中检测 SQL 拼接
SQL_EXEC_FUNCS = {'execute', 'executemany', 'query', 'exec_driver_sql', 'execute_query',
                  'executeUpdate', 'executeQuery', 'raw'}
SQL_WRAP_FUNCS = {'text'}


def norm_name(name):
    """规范化标识符用于密钥名匹配：api_key -> apikey"""
    return re.sub(r'[^a-z0-9]', '', name.lower())


def line_end(node):
    return getattr(node, 'end_lineno', node.lineno)


# ==================== 结果收集 ====================
class Collector:
    def __init__(self):
        self.findings = []

    def add(self, severity, category, title, filepath, line, desc, suggestion):
        self.findings.append({
            'severity': severity, 'category': category, 'title': title,
            'file': filepath, 'line': line, 'desc': desc, 'suggestion': suggestion,
        })


# ==================== 检测器 ====================
class SecretDetector(ast.NodeVisitor):
    """硬编码密钥/密码检测"""
    def __init__(self, col, path):
        self.col, self.path = col, path

    def _add_secret(self, line, desc):
        self.col.add(
            'critical', 'security', '硬编码密钥/密码',
            self.path, line, desc,
            '改用环境变量或密钥管理服务，如 os.environ["..."]；已泄露的密钥立即轮换')

    def visit_Assign(self, node):
        for t in node.targets:
            if isinstance(t, ast.Name):
                nm = norm_name(t.id)
                if any(h in nm for h in SECRET_HINTS):
                    val = get_string(node.value)
                    if val and len(val) >= 6:
                        self._add_secret(node.lineno, f'变量 `{t.id}` 以明文硬编码赋值，代码泄露即密钥暴露')
        self.generic_visit(node)

    def visit_Call(self, node):
        # 关键字参数：connect(password="secret")
        for kw in node.keywords:
            if kw.arg and any(h in norm_name(kw.arg) for h in SECRET_HINTS):
                val = get_string(kw.value)
                if val and len(val) >= 6:
                    self._add_secret(node.lineno, f'参数 `{kw.arg}` 传入硬编码密钥')
        self.generic_visit(node)

    def visit_Dict(self, node):
        # 字典字面量：{"password": "secret"}
        for k, v in zip(node.keys, node.values):
            key_str = get_string(k)
            if key_str and any(h in norm_name(key_str) for h in SECRET_HINTS):
                val = get_string(v)
                if val and len(val) >= 6:
                    self._add_secret(node.lineno, f'字典键 `{key_str}` 的值为硬编码密钥')
        self.generic_visit(node)


class SQLInjectionDetector(ast.NodeVisitor):
    """SQL 注入检测：数据流追踪——记录被赋值为 SQL 拼接的变量，在 SQL 执行处检测"""
    def __init__(self, col, path):
        self.col, self.path = col, path
        self.sql_vars = set()  # 被赋值为 SQL 拼接的变量名

    def _report(self, line, kind):
        self.col.add(
            'critical', 'security', f'SQL 注入（{kind}）', self.path, line,
            'SQL 语句通过字符串拼接/插值构造，攻击者可注入任意 SQL',
            '改用参数化查询，如 cursor.execute("SELECT ... WHERE id=%s", (id,))')

    def _expr_is_sql_injection(self, node):
        """表达式是否为「含变量的 SQL 字符串构造」"""
        if isinstance(node, ast.JoinedStr):
            static = ''.join(
                v.value if isinstance(v, ast.Constant) and isinstance(v.value, str)
                else '{' for v in node.values)
            has_var = any(isinstance(v, ast.FormattedValue) for v in node.values)
            return has_var and has_sql(static)
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            left_str = get_string(node.left)
            right_str = get_string(node.right)
            has_sql_str = (left_str and has_sql(left_str)) or (right_str and has_sql(right_str))
            has_var = left_str is None or right_str is None
            return has_sql_str and has_var
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute) and node.func.attr == 'format':
                base = get_string(node.func.value)
                return bool(base and has_sql(base) and node.args)
            if isinstance(node.func, ast.Name) and node.func.id in SQL_WRAP_FUNCS:
                return any(self._expr_is_sql_injection(a) for a in node.args)
        return False

    def _value_tainted(self, node):
        """判断赋值表达式的污点状态：直接 SQL 拼接，或转换了已污点变量"""
        if self._expr_is_sql_injection(node):
            return True
        for child in ast.walk(node):
            if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Load) and child.id in self.sql_vars:
                return True
        return False

    def visit_Assign(self, node):
        # 数据流追踪：污点分析——记录/移除被赋值的 SQL 拼接变量
        for target in node.targets:
            if isinstance(target, ast.Name):
                if self._value_tainted(node.value):
                    self.sql_vars.add(target.id)
                else:
                    self.sql_vars.discard(target.id)
        self.generic_visit(node)

    def visit_Call(self, node):
        func_name = node.func.attr if isinstance(node.func, ast.Attribute) else (
            node.func.id if isinstance(node.func, ast.Name) else '')
        if func_name in SQL_EXEC_FUNCS:
            for arg in node.args:
                if self._expr_is_sql_injection(arg):
                    self._report(node.lineno, '字符串拼接')
                elif isinstance(arg, ast.Name) and arg.id in self.sql_vars:
                    self._report(node.lineno, '变量拼接（数据流追踪）')
        self.generic_visit(node)


class ExecDetector(ast.NodeVisitor):
    """危险命令执行：精确判断 shell=True，消除正则误报"""
    SUBPROCESS = {'run', 'call', 'Popen', 'check_output', 'check_call'}

    def __init__(self, col, path):
        self.col, self.path = col, path

    def visit_Call(self, node):
        # eval / exec
        if isinstance(node.func, ast.Name) and node.func.id in ('eval', 'exec'):
            self.col.add(
                'major', 'security', f'动态执行 {node.func.id}()', self.path,
                node.lineno, f'使用 {node.func.id}() 执行动态内容，若含用户输入可能代码执行',
                '避免使用，或严格限制输入来源')
        # os.system / os.popen
        if isinstance(node.func, ast.Attribute) and node.func.attr in ('system', 'popen'):
            self.col.add(
                'critical', 'security', f'命令执行 os.{node.func.attr}()', self.path,
                node.lineno, '通过 shell 执行命令，拼接用户输入即命令注入',
                '改用 subprocess.run([...]) 参数列表形式，避免 shell')
        # subprocess.* 精确检查 shell 参数
        if isinstance(node.func, ast.Attribute) and node.func.attr in self.SUBPROCESS:
            for kw in node.keywords:
                if kw.arg == 'shell':
                    v = get_constant(kw.value)
                    if v is True:
                        self.col.add(
                            'critical', 'security', '命令注入（shell=True）', self.path,
                            node.lineno, 'subprocess 以 shell=True 执行，拼接不可信输入即命令注入',
                            '去掉 shell=True，改用参数列表 subprocess.run(["cmd", arg])')
                    elif v is None and not isinstance(kw.value, ast.Constant):
                        self.col.add(
                            'major', 'security', 'shell 参数为变量（需人工确认）', self.path,
                            node.lineno, 'shell 参数值来自变量，无法静态确认是否开启',
                            '确认该变量运行时不会为 True，或显式改为 shell=False')
        self.generic_visit(node)


class FunctionAnalyzer(ast.NodeVisitor):
    """函数级指标：行数 + 圈复杂度"""
    def __init__(self, col, path):
        self.col, self.path = col, path

    def _complexity(self, node):
        c = 1
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.For, ast.AsyncFor, ast.While,
                                  ast.ExceptHandler, ast.With, ast.AsyncWith,
                                  ast.Assert, ast.IfExp)):
                c += 1
            elif isinstance(child, ast.BoolOp):
                c += len(child.values) - 1
            elif isinstance(child, ast.comprehension):
                c += 1
        return c

    def visit_FunctionDef(self, node):
        self._check(node)
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node):
        self._check(node)
        self.generic_visit(node)

    def _check(self, node):
        lines = line_end(node) - node.lineno + 1
        cx = self._complexity(node)
        if lines > LONG_FUNC_LINES:
            self.col.add(
                'minor', 'maintainability', f'超长函数 {node.name}()', self.path,
                node.lineno, f'函数 {lines} 行，超过 {LONG_FUNC_LINES} 行，可能承担多个职责',
                '按职责拆分为多个小函数')
        if cx > MAX_COMPLEXITY:
            self.col.add(
                'minor', 'maintainability', f'复杂度过高 {node.name}()', self.path,
                node.lineno, f'圈复杂度 {cx}，超过 {MAX_COMPLEXITY}，难以理解和测试',
                '拆分条件分支、提取子函数或使用查表法降低复杂度')


class NestingDetector(ast.NodeVisitor):
    """过深嵌套检测"""
    def __init__(self, col, path):
        self.col, self.path, self.depth, self.path_so_far = col, path, 0, []

    def _enter(self, node):
        self.depth += 1
        if self.depth > MAX_NESTING:
            self.col.add(
                'minor', 'maintainability', '过深嵌套', self.path,
                node.lineno, f'嵌套深度 {self.depth}，超过 {MAX_NESTING} 层，可读性差',
                '使用提前返回（early return）/卫语句扁平化，或提取子函数')
            self.depth -= 1
            return
        self.generic_visit(node)
        self.depth -= 1

    def visit_If(self, node): self._enter(node)
    def visit_For(self, node): self._enter(node)
    def visit_AsyncFor(self, node): self._enter(node)
    def visit_While(self, node): self._enter(node)


class MagicNumberDetector(ast.NodeVisitor):
    """魔法数字检测（启发式，避免噪声）"""
    def __init__(self, col, path):
        self.col, self.path, self.seen = col, path, set()

    def _check(self, node, v):
        if isinstance(v, (int, float)) and v not in MAGIC_ALLOWED:
            key = (node.lineno, v)
            if key not in self.seen:
                self.seen.add(key)
                self.col.add(
                    'nit', 'maintainability', '魔法数字', self.path, node.lineno,
                    f'数字 {v} 缺少命名含义', '提取为具名常量，注明业务含义')

    def visit_Compare(self, node):
        for comp in node.comparators:
            self._check(node, get_constant(comp))
        self.generic_visit(node)

    def visit_BinOp(self, node):
        # 乘/除/幂运算中的常量更可能是「系数/倍率」类魔法数字；加减偏移噪声大，跳过
        if isinstance(node.op, (ast.Mult, ast.Div, ast.FloorDiv, ast.Pow)):
            self._check(node, get_constant(node.left))
            self._check(node, get_constant(node.right))
        self.generic_visit(node)


class ImportAnalyzer(ast.NodeVisitor):
    """未使用的导入检测（死代码检测需跨文件分析，交由 AI 深度审查完成）"""
    def __init__(self, col, path):
        self.col, self.path = col, path
        self.imports = {}   # name -> (lineno, module)
        self.used = set()

    def visit_Import(self, node):
        for a in node.names:
            n = (a.asname or a.name).split('.')[0]
            self.imports[n] = (node.lineno, a.name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        for a in node.names:
            if a.name == '*':
                continue
            n = a.asname or a.name
            self.imports[n] = (node.lineno, f'{node.module}.{a.name}')
        self.generic_visit(node)

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            self.used.add(node.id)
        self.generic_visit(node)

    def report(self):
        for name, (lineno, mod) in self.imports.items():
            if name not in self.used:
                self.col.add(
                    'nit', 'maintainability', f'未使用的导入 {mod}', self.path,
                    lineno, f'导入 `{mod}` 未在代码中使用', '删除未使用的导入')


class NPlusOneDetector(ast.NodeVisitor):
    """N+1 查询：循环体内执行数据库查询"""
    DB_FUNCS = SQL_EXEC_FUNCS

    def __init__(self, col, path):
        self.col, self.path = col, path
        self.in_loop = 0

    def _enter_loop(self, node):
        self.in_loop += 1
        self.generic_visit(node)
        self.in_loop -= 1

    def visit_For(self, node):
        self._enter_loop(node)

    def visit_AsyncFor(self, node):
        self._enter_loop(node)

    def visit_While(self, node):
        self._enter_loop(node)

    def visit_Call(self, node):
        if self.in_loop > 0:
            func_name = node.func.attr if isinstance(node.func, ast.Attribute) else (
                node.func.id if isinstance(node.func, ast.Name) else '')
            if func_name in self.DB_FUNCS:
                self.col.add(
                    'major', 'performance', 'N+1 查询', self.path, node.lineno,
                    '循环体内执行数据库查询，数据量为 N 时产生 N 次查询，性能随数据量线性恶化',
                    '用 JOIN 或 IN 一次查出所有数据，在循环外批量查询')
        self.generic_visit(node)


class MutableDefaultDetector(ast.NodeVisitor):
    """可变默认参数：def f(x=[]) 是经典 bug，所有调用共享同一个对象"""
    MUTABLE_TYPES = (ast.List, ast.Dict, ast.Set)

    def __init__(self, col, path):
        self.col, self.path = col, path

    def _check(self, node):
        for arg in node.args.defaults:
            if isinstance(arg, self.MUTABLE_TYPES):
                self.col.add(
                    'major', 'correctness', '可变默认参数', self.path, node.lineno,
                    f'函数 `{node.name}` 的默认参数是可变对象，所有调用共享同一个对象，可能产生意外副作用',
                    f'改用 None 作默认值，函数体内判断：def {node.name}(x=None): x = x or []')

    def visit_FunctionDef(self, node):
        self._check(node)
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node):
        self._check(node)
        self.generic_visit(node)


class UnsafeDeserializationDetector(ast.NodeVisitor):
    """不安全反序列化：pickle.loads / yaml.load 处理不可信数据可导致代码执行"""
    def __init__(self, col, path):
        self.col, self.path = col, path

    def visit_Call(self, node):
        if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
            module = node.func.value.id
            func = node.func.attr
            if module in ('pickle', 'marshal', 'shelve') and func in ('load', 'loads'):
                self.col.add(
                    'critical', 'security', '不安全反序列化', self.path, node.lineno,
                    f'{module}.{func} 反序列化不可信数据时，攻击者可构造恶意数据执行任意代码',
                    '避免反序列化不可信数据，或改用安全格式（如 json）；yaml 请用 yaml.safe_load')
            elif module == 'yaml' and func == 'load':
                self.col.add(
                    'major', 'security', '不安全的 YAML 加载', self.path, node.lineno,
                    'yaml.load 可执行任意代码，处理不可信数据时危险',
                    '改用 yaml.safe_load')
        self.generic_visit(node)


class BareExceptDetector(ast.NodeVisitor):
    """裸 except 或吞掉宽泛异常（特定异常如 ImportError 通常是有意的，不报）"""
    def __init__(self, col, path):
        self.col, self.path = col, path

    def _is_broad_exception(self, node):
        if isinstance(node, ast.Name):
            return node.id in ('Exception', 'BaseException')
        if isinstance(node, ast.Tuple):
            return any(self._is_broad_exception(e) for e in node.elts)
        return False

    def visit_ExceptHandler(self, node):
        if node.type is None:
            self.col.add(
                'major', 'correctness', '裸 except', self.path, node.lineno,
                '裸 except 会捕获所有异常（含 KeyboardInterrupt/SystemExit），掩盖真实错误',
                '明确捕获具体的异常类型')
        elif len(node.body) == 1 and isinstance(node.body[0], ast.Pass):
            # 只报宽泛异常吞掉；特定异常（如 ImportError）通常是有意的（可选依赖）
            if self._is_broad_exception(node.type):
                self.col.add(
                    'minor', 'correctness', '异常被吞掉', self.path, node.lineno,
                    '宽泛异常被静默吞掉，问题被掩盖，难以排查',
                    '至少记录日志，或明确处理异常')
        self.generic_visit(node)


# ==================== 单文件分析 ====================
def analyze_file(path, col):
    try:
        source = Path(path).read_text(encoding='utf-8', errors='replace')
    except OSError as e:
        col.add('major', 'correctness', '无法读取文件', str(path), 0, str(e), '检查文件权限')
        return

    # 文件级：超大文件
    nlines = source.count('\n') + 1
    if nlines > LARGE_FILE_LINES:
        col.add('minor', 'maintainability', '超大文件', str(path), 0,
                f'文件 {nlines} 行，超过 {LARGE_FILE_LINES} 行，职责可能过重',
                '按职责拆分为多个模块')

    # TODO/FIXME 注释
    for i, line in enumerate(source.splitlines(), 1):
        if re.search(r'\b(TODO|FIXME|HACK|XXX)\b', line):
            col.add('nit', 'maintainability', '待办标记', str(path), i,
                    f'{line.strip()[:60]}', '补充实现或记录到任务系统')

    # 语法解析
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        col.add('major', 'correctness', '语法错误', str(path), e.lineno or 0,
                f'{e.msg}', '修复语法错误')
        return

    # 运行各检测器
    SecretDetector(col, str(path)).visit(tree)
    SQLInjectionDetector(col, str(path)).visit(tree)
    ExecDetector(col, str(path)).visit(tree)
    UnsafeDeserializationDetector(col, str(path)).visit(tree)
    NPlusOneDetector(col, str(path)).visit(tree)
    MutableDefaultDetector(col, str(path)).visit(tree)
    BareExceptDetector(col, str(path)).visit(tree)
    FunctionAnalyzer(col, str(path)).visit(tree)
    NestingDetector(col, str(path)).visit(tree)
    MagicNumberDetector(col, str(path)).visit(tree)
    ia = ImportAnalyzer(col, str(path))
    ia.visit(tree)
    ia.report()


# ==================== 文件收集 ====================
def collect_files(target, maxdepth, maxfiles):
    target = Path(target)
    if target.is_file():
        return [target] if target.suffix == '.py' else []
    files = []
    for root, dirs, names in os.walk(target):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        depth = len(Path(root).relative_to(target).parts)
        if depth >= maxdepth:
            dirs[:] = []
        for n in names:
            if n.endswith('.py'):
                files.append(Path(root) / n)
                if len(files) >= maxfiles:
                    return files
    return files


# ==================== diff 模式 ====================
def run_diff(target):
    try:
        out = subprocess.run(
            ['git', '-C', str(target), 'diff', '--name-only'],
            capture_output=True, text=True, timeout=15)
        stat = subprocess.run(
            ['git', '-C', str(target), 'diff', '--stat'],
            capture_output=True, text=True, timeout=15)
        branch = subprocess.run(
            ['git', '-C', str(target), 'branch', '--show-current'],
            capture_output=True, text=True, timeout=15)
        print('===== 代码审查（AST 版）diff 模式 =====')
        print(f'目标: {target}')
        print(f'分支: {branch.stdout.strip() or "N/A"}')
        print('\n[变更文件清单]')
        print(out.stdout.strip() or '（无未提交变更）')
        print('\n[变更统计]')
        print(stat.stdout.strip() or '（无）')
    except FileNotFoundError:
        print('[提示] 未找到 git，diff 模式不可用')
    except Exception as e:
        print(f'[提示] diff 分析失败: {e}')


# ==================== 输出 ====================
SEV_ORDER = ['critical', 'major', 'minor', 'nit']
SEV_LABEL = {'critical': '🔴 Critical', 'major': '🟠 Major',
             'minor': '🟡 Minor', 'nit': '🔵 Nit'}
SEV_PREFIX = {'critical': 'C', 'major': 'M', 'minor': 'm', 'nit': 'N'}


def print_report(col, target, file_count):
    fs = col.findings
    print('===== 代码审查静态分析报告（AST 版）=====')
    print(f'目标: {target}')
    print(f'分析文件数: {file_count}')
    print(f'发现问题数: {len(fs)}')
    print()
    if not fs:
        print('未发现明显问题。')
    grouped = {}
    for f in fs:
        grouped.setdefault(f['severity'], []).append(f)
    for sev in SEV_ORDER:
        items = grouped.get(sev, [])
        if not items:
            continue
        print(f'## {SEV_LABEL[sev]}（{len(items)} 条）')
        for i, f in enumerate(items, 1):
            loc = f'{f["file"]}:{f["line"]}' if f['line'] else f['file']
            print(f'  [{SEV_PREFIX[sev]}-{i}] {f["title"]}  @ {loc}')
            print(f'      问题: {f["desc"]}')
            print(f'      建议: {f["suggestion"]}')
        print()
    print('===== 分析结束 =====')


# ==================== 主入口 ====================
def main():
    ap = argparse.ArgumentParser(description='代码审查静态分析器（AST 版）')
    ap.add_argument('target', nargs='?', default='.', help='目标路径（文件或目录）')
    ap.add_argument('--diff', '-d', action='store_true', help='diff 模式')
    ap.add_argument('--maxdepth', type=int, default=12, help='目录递归深度')
    ap.add_argument('--maxfiles', type=int, default=5000, help='扫描文件数上限')
    ap.add_argument('--json', action='store_true', help='输出 JSON')
    args = ap.parse_args()

    if not os.path.exists(args.target):
        print(f'[错误] 目标不存在: {args.target}')
        sys.exit(1)

    if args.diff:
        run_diff(args.target)
        return

    files = collect_files(args.target, args.maxdepth, args.maxfiles)
    if not files:
        print(f'[提示] 未找到 .py 文件（当前为 Python 专用 AST 分析器）')
        return

    col = Collector()
    for f in files:
        analyze_file(f, col)

    if args.json:
        print(json.dumps(col.findings, ensure_ascii=False, indent=2))
    else:
        print_report(col, args.target, len(files))


if __name__ == '__main__':
    main()
