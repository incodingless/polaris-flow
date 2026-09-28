# Java/Spring 代码质量与可维护性专项清单

> 本清单由 `SKILL.md` 在识别到 Spring Boot / Spring Cloud / MyBatis 技术栈时加载，作为可维护性/正确性维度的深度检查项。严重度已按 `review-rubric.md` 的四级定义统一标注。

## 检查顺序

1. 高危面：for 循环遍历时删除元素、异常处理缺失（全局异常处理、异常吞没、日志缺上下文、未区分业务/系统异常、抛 Java 内置异常、异常信息直接返回前端）、异步线程异常未捕获。
2. 中危面：重复编码、业务逻辑写在 Controller、类方法数量超 15、类依赖超 10、魔法数字、敏感信息命名、日志不规范。
3. 低危面：过长方法/类、单一职责、命名、注释。

## 检查项清单（24 条）

### 代码结构与分层（5 条）

| 关注点 | 严重度 |
|--------|--------|
| for 循环遍历时删除元素的错误方法 | Major |
| 是否存在重复编码 | Minor |
| 业务逻辑代码大量写在 Controller 层（含 Controller 含业务处理逻辑） | Minor |
| 是否存在过长的方法或类（超 100 行/含废弃代码/多余空行） | Nit |
| 是否遵循单一职责原则 | Nit |

### 类设计规范（2 条）

| 关注点 | 严重度 |
|--------|--------|
| 单个类方法数量是否超过 15 个 | Minor |
| 单个类依赖数量是否超过 10 个 | Minor |

### 代码可维护性（6 条）

| 关注点 | 严重度 |
|--------|--------|
| 是否存在魔法数字或硬编码常量 | Minor |
| 敏感信息变量命名是否合规（禁止 passwd/pwd/mobile/idcard 等） | Minor |
| 命名是否清晰且符合规范 | Nit |
| 方法参数是否过多（如超过 5 个） | Nit |
| 是否存在深层嵌套（超过 5 层 if/for/try） | Nit |
| 注释是否充分且准确（类/方法/业务分支/实体类属性注释与约束） | Nit |

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

### 1. for 循环遍历时删除元素

**反例**：`for-each` 遍历时直接 `list.remove()` → `ConcurrentModificationException` 或跳过元素。

```java
for (User user : users) { if (!user.isActive()) { users.remove(user); } }
```

**正例**：`users.removeIf(user -> !user.isActive());` 或使用 `Iterator.remove()`。

### 2. 重复编码

**反例**：多处代码逻辑高度相似，仅参数或返回类型不同（如 `convertOrder` / `toOrderVO` 做相同字段映射）。

**正例**：提取公共转换方法或使用 MapStruct 等映射工具。

### 3. 业务逻辑写在 Controller 层

**反例**：Controller 中包含业务逻辑、数据校验、数据库操作。

**正例**：Controller 只做参数接收与响应封装，业务逻辑下沉到 Service：

```java
@RestController
@RequestMapping("/orders")
public class OrderController {
    @Autowired
    private OrderService orderService;
    @PostMapping
    public ApiResponse<OrderVO> createOrder(@RequestBody @Valid OrderRequest request) {
        OrderVO result = orderService.createOrder(request);
        return ApiResponse.success(result);
    }
}
```

### 4. 过长的方法或类

**反例**：单个方法超过 100 行；存在废弃代码或多余空行。

**正例**：按职责拆分方法、删除废弃代码、去除不必要空行。

### 5. 单一职责原则

**反例**：一个 Service 同时处理订单创建、库存扣减、通知发送、报表生成。

**正例**：按领域拆分为独立的 Service。

### 6. 单个类方法数量超过 15 个

**反例**：一个 `UserManageService` 包含 20+ 方法。

**正例**：按功能维度拆分（`UserQueryService`/`UserOperateService`/`UserRoleService`）。

**例外**：工具类（如 `StringUtil`）因聚合通用静态方法可适当放宽，但需保证方法逻辑独立、命名清晰。

### 7. 单个类依赖数量超过 10 个

**反例**：一个 Service 通过 `@Autowired` 注入 12 个依赖（多个 Mapper、多个远程 Client、多个工具类）。

**正例**：合并相关依赖（聚合到门面类 `XXXFacade`）；按业务领域拆分类；剔除冗余依赖。

### 8. 魔法数字或硬编码常量

**反例**：`order.getStatus().equals("3")`、`order.getRetryCount() > 5`、`Thread.sleep(30000)`。

**正例**：提取为命名常量或枚举：

```java
public static final int MAX_RETRY_COUNT = 5;
public static final long RETRY_DELAY_MS = 30_000;
```

**更优**：使用枚举替代字符串状态码。

### 9. 敏感信息变量命名

**反例**：`password`、`pwd`、`userPasswd`、`mobile`、`phoneNum`、`idCard` — 可被直接猜出含义。

**正例**：密码类用 `XXX_pswc`、手机号类用 `XXX_mpn`、身份证类用 `XXX_icn`。

**规则**：禁止使用 `passwd`/`password`/`pwd`/`mobile`/`phonenum`/`idcard` 等敏感信息英文（不区分大小写）。

### 10. 命名规范

**反例**：单字母字段 `private String s;`、拼音命名、方法名用名词 `public void proc()`。

**正例**：命名自文档化。Package 全小写；类名大驼峰；方法名小驼峰；布尔用 `is/has/can` 前缀。

### 11. 方法参数过多

**反例**：方法参数超过 5 个。

**正例**：封装为参数对象。

### 12. 深层嵌套

**反例**：if/for/try 嵌套超过 5 层。

**正例**：使用卫语句（early return）、提取方法、Optional 等降低嵌套层级。

### 13. 注释规范

**反例**：类/方法无注释，业务代码关键分支无注释，实体类属性无注释或无约束注解。

**正例**：
- 类注释：`@Description` + `@Author` + `@Date`
- 方法注释：方法说明 + `@param` + `@return` + `@throws`
- 业务代码注释：if/else/switch/try-catch 等关键分支注明调用目的、预期结果、分支适配场景
- 实体类属性：多行注释 + 注解约束（`@NotNull`/`@Size` 等），枚举值逐一注释

### 14. 全局异常处理机制

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

### 15. 异常日志包含足够的上下文信息

**反例**：`log.error("创建订单失败: {}", e.getMessage());` — 缺少业务上下文。

**正例**：`log.error("创建订单失败, userId={}, orderNo={}, request={}", request.getUserId(), request.getOrderNo(), request, e);`

### 16. 区分业务异常和系统异常

**反例**：`throw new NullPointerException("订单不能为空")`、`throw new RuntimeException("库存不足")`。

**正例**：自定义异常体系，`BusinessException`（含 code + displayMessage + 内部 logMessage）与 `SystemException` 分离。前端返回 `displayMessage`，日志记录 `message`。

### 17. 空 catch 块或异常被吞没

**反例**：空 catch 块；或仅 `e.printStackTrace()` 不做其他处理。

**正例**：该抛出就抛出，该记录就记录并做补偿：

```java
catch (IOException e) { log.error("加载配置失败, path={}", filePath, e); throw new SystemException("配置加载失败", e); }
```

### 18. 禁止将异常报错信息直接返回前端

**反例**：`return Result.fail(e.getMessage());` — 可能暴露系统内部细节。

**正例**：`log.error("系统异常", e); return Result.fail("系统繁忙，请稍后重试");` — 前端返回统一用户友好提示，`BusinessException` 返回 `displayMessage` 而非 `message`。

> 与 `java-security.md` 分工：本清单关注异常处理的通用规范；security 关注异常处理导致的**信息泄漏**（其严重度更高，标 Critical）。

### 19. `finally` 块中抛出异常

**反例**：`finally` 块中抛出异常，覆盖原始异常。

**正例**：`finally` 块中的异常应捕获并记录，不覆盖原始异常。更优：使用 try-with-resources。

### 20. 异常堆栈信息完整记录

**反例**：`logger.error("处理订单失败，订单ID：" + orderId + "，原因：" + e.getMessage());` — 未传入异常对象，堆栈缺失。

**正例**：`logger.error("处理订单失败，订单ID：{}", orderId, e);` — 必须传入异常对象。

### 21. 日志使用占位符而非字符串拼接

**反例**：`logger.info("用户登录成功，用户名：" + username + "，IP地址：" + ipAddress);`

**正例**：`logger.info("用户登录成功，用户名：{}，IP地址：{}", username, ipAddress);`

### 22. 日志中禁止记录敏感信息

**反例**：日志中直接输出密码、身份证号、银行卡号等敏感信息。

**正例**：禁止输出敏感信息；如必须记录，应脱敏处理（如 `138****1234`）。

### 23. 调用外部系统时记录请求和响应

**反例**：调用外部系统或服务时无日志记录。

**正例**：记录外部调用的请求和响应，帮助追踪问题并了解系统间依赖关系。

### 24. 异步线程中异常必须在子线程中捕获

**反例**：`new Thread(() -> { throw new RuntimeException("子线程异常"); }).start();` — 主线程无法捕获。

**正例**：

```java
new Thread(() -> { try { doWork(); } catch (Exception e) { log.error("子线程执行失败", e); } }).start();
```

---

## 快速决策提示

- **「循环中删除元素了吗」**：`for-each` 遍历 + `list.remove()` → Major，要求改用 `removeIf` 或 `Iterator.remove()`。
- **「异常处理完善吗」**：无全局异常处理器 / 空 catch 块 / `e.printStackTrace()` / 日志缺上下文 / 未区分业务与系统异常 / 抛 Java 内置异常 / 异常信息直接返回前端 → Major。
- **「日志规范吗」**：日志用字符串拼接 / 堆栈信息缺失 / 记录敏感信息 / 外部调用无日志 / 异步线程异常未捕获 → Minor（堆栈缺失为 Major）。
- **「分层对了吗」**：Controller 中含业务逻辑/数据库操作 → Minor，要求下沉到 Service。
- **「类设计合理吗」**：类方法超 15 个 / 类依赖超 10 个 → Minor，要求拆分或合并。
- **「有重复代码吗」**：多处高度相似的代码块 → Minor，要求提取公共方法。
- **「有魔法数字吗」**：含义不明的数字/字符串字面量 → Minor，要求提取常量或枚举。
- **「敏感信息命名安全吗」**：变量名含 passwd/pwd/mobile/idcard 等敏感词 → Minor，要求改用 pswc/mpn/icn 等缩写。
- **「可维护性如何」**：过长方法/类、深层嵌套、参数过多、命名不清、注释缺失 → Nit，给出重构方向。
