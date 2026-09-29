# Java/Spring 代码质量专项清单（异常处理与日志规范）

## 检查顺序

1. 高危面（Major）：无全局异常处理机制、异常吞没（空 `catch` / `e.printStackTrace()`）、异常日志缺上下文、未区分业务异常与系统异常（抛 Java 内置异常）、异常信息直接返回前端、异常堆栈未传入异常对象。
2. 中危面（Minor）：`finally` 块抛异常覆盖原始异常、日志字符串拼接、日志记录敏感信息、外部调用无请求/响应日志、异步线程异常未在子线程捕获。

## 检查项清单（11 条）

### 异常处理（6 条）

| 关注点 | 严重度 |
|--------|--------|
| 是否有全局异常处理机制（`@ControllerAdvice`/`@RestControllerAdvice`） | Major |
| 异常日志是否包含足够的上下文信息 | Major |
| 是否区分业务异常和系统异常（禁止抛 Java 内置异常） | Major |
| 是否存在空 `catch` 块或异常被吞没（含 `e.printStackTrace()`） | Major |
| 是否禁止将异常报错信息直接返回前端 | Major |
| `finally` 块中是否抛出异常（覆盖原始异常） | Minor |

### 日志规范（5 条）

| 关注点 | 严重度 |
|--------|--------|
| 异常堆栈信息是否完整记录（必须传入异常对象） | Major |
| 日志是否使用占位符而非字符串拼接 | Minor |
| 日志中是否记录了敏感信息（密码/身份证/银行卡等） | Minor |
| 调用外部系统或服务时是否记录请求和响应 | Minor |
| 异步线程中抛出异常是否在子线程中捕获 | Minor |

---

## 正反例（用于快速对照）

### 1. 全局异常处理机制

**反例**：无 `@ControllerAdvice`/`@RestControllerAdvice`，各 Controller 自行 try-catch 或直接抛出。

**正例**：统一全局异常处理，按异常类型分别处理：

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException ex) {
        log.warn("Business exception: {}", ex.getMessage(), ex);
        return ResponseEntity.badRequest().body(ApiResponse.fail(ex.getCode(), ex.getDisplayMessage()));
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneralException(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.badRequest().body(ApiResponse.fail(5001, "系统繁忙，请稍后再试"));
    }
}
```

### 2. 异常日志包含足够的上下文信息

**反例**：`log.error("创建订单失败: {}", e.getMessage());` — 缺少业务上下文。

**正例**：`log.error("创建订单失败, userId={}, orderNo={}, request={}", request.getUserId(), request.getOrderNo(), request, e);`

### 3. 区分业务异常和系统异常

**反例**：`throw new NullPointerException("订单不能为空")`、`throw new RuntimeException("库存不足")`。

**正例**：自定义异常体系，`BusinessException`（含 code + displayMessage + 内部 logMessage）与 `SystemException` 分离。前端返回 `displayMessage`，日志记录 `message`。

### 4. 空 catch 块或异常被吞没

**反例**：空 catch 块；或仅 `e.printStackTrace()` 不做其他处理。

**正例**：该抛出就抛出，该记录就记录并做补偿：

```java
catch (IOException e) { log.error("加载配置失败, path={}", filePath, e); throw new SystemException("配置加载失败", e); }
```

### 5. 禁止将异常报错信息直接返回前端

**反例**：`return Result.fail(e.getMessage());` — 可能暴露系统内部细节。

**正例**：`log.error("系统异常", e); return Result.fail("系统繁忙，请稍后重试");` — 前端返回统一用户友好提示，`BusinessException` 返回 `displayMessage` 而非 `message`。

> 与 `security-checklist.md` §二 分工：code-quality 关注异常处理的通用规范；security 关注异常处理导致的**信息泄漏**（其严重度更高，标 Critical）。

### 6. `finally` 块中抛出异常

**反例**：`finally` 块中抛出异常，覆盖原始异常。

**正例**：`finally` 块中的异常应捕获并记录，不覆盖原始异常。更优：使用 try-with-resources。

### 7. 异常堆栈信息完整记录

**反例**：`logger.error("处理订单失败，订单ID：" + orderId + "，原因：" + e.getMessage());` — 未传入异常对象，堆栈缺失。

**正例**：`logger.error("处理订单失败，订单ID：{}", orderId, e);` — 必须传入异常对象。

### 8. 日志使用占位符而非字符串拼接

**反例**：`logger.info("用户登录成功，用户名：" + username + "，IP地址：" + ipAddress);`

**正例**：`logger.info("用户登录成功，用户名：{}，IP地址：{}", username, ipAddress);`

### 9. 日志中禁止记录敏感信息

**反例**：日志中直接输出密码、身份证号、银行卡号等敏感信息。

**正例**：禁止输出敏感信息；如必须记录，应脱敏处理（如 `138****1234`）。

### 10. 调用外部系统时记录请求和响应

**反例**：调用外部系统或服务时无日志记录。

**正例**：记录外部调用的请求和响应，帮助追踪问题并了解系统间依赖关系。

### 11. 异步线程中异常必须在子线程中捕获

**反例**：`new Thread(() -> { throw new RuntimeException("子线程异常"); }).start();` — 主线程无法捕获。

**正例**：

```java
new Thread(() -> { try { doWork(); } catch (Exception e) { log.error("子线程执行失败", e); } }).start();
```

---

## 快速决策提示

- **「异常处理完善吗」**：无全局异常处理器 / 空 `catch` 块 / `e.printStackTrace()` / 日志缺上下文 / 未区分业务与系统异常 / 抛 Java 内置异常 / 异常信息直接返回前端 → Major。
- **「日志规范吗」**：日志用字符串拼接 / 堆栈信息缺失 / 记录敏感信息 / 外部调用无日志 / 异步线程异常未捕获 → Minor（堆栈缺失为 Major）。
- **「`finally` 里抛异常了吗」**：`finally` 中抛异常覆盖原始异常 → Minor，改用 try-with-resources 或捕获后记录。
- **「该报本清单还是 security」**：异常导致的**信息泄漏**（异常栈返回客户端、敏感信息入日志）→ `security-checklist.md` §二，按 Critical 从严；其余异常/日志规范问题 → 本清单。
