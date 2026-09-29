# Java/Spring 接口设计专项清单

## 检查顺序

1. 高危面：接口参数校验缺失、敏感数据传输未加密。
2. 中危面：接口设计不合理/拆分不恰当（胖接口、职责混杂、过度耦合）、业务逻辑写在 Controller 层。
3. 低危面：接口返回格式不统一规范。

## 检查项清单

### 参数校验

| 关注点 | 严重度 |
|--------|--------|
| 接口是否进行了参数校验（注解校验 `@Valid`/`@Validated` 或代码内手动校验均可） | Major |

### 数据安全

| 关注点 | 严重度 |
|--------|--------|
| 接口传输敏感数据时是否进行加密 | Critical |

### 接口设计

| 关注点 | 严重度 |
|--------|--------|
| 接口设计是否合理，拆分是否恰当 | Minor |
| Controller 是否只做参数接收与响应封装（业务逻辑是否下沉到 Service） | Minor |

### 返回格式

| 关注点 | 严重度 |
|--------|--------|
| 接口返回格式是否统一规范 | Nit |

---

## 正反例（用于快速对照）

### 1. 接口参数校验缺失

**静态边界**：校验的**目标是确保非法输入不进入业务逻辑**，实现方式有两种——**注解校验**（`@Valid`/`@Validated` + 约束注解）和**代码内手动校验**（`if` 判断、`Objects.requireNonNull`、`Preconditions.checkArgument`、自定义校验方法等）。两种均合规，审查时确认**是否做了校验**，而非**是否用了注解**。仅在既无注解校验、也无手动校验时才标记为问题。

**反例**：Controller 方法参数无 `@Valid`/`@Validated`，请求体字段无约束注解，代码中无任何手动校验。

```java
@PostMapping("/orders")
public ApiResponse<OrderVO> createOrder(@RequestBody OrderRequest request) {
    return ApiResponse.success(orderService.createOrder(request));
}

public class OrderRequest {
    private String userId;
    private BigDecimal amount;
    private String address;
}
```

**正例 A**（推荐）：参数加 `@Valid`/`@Validated`，字段加约束注解。

```java
@PostMapping("/orders")
public ApiResponse<OrderVO> createOrder(@RequestBody @Valid OrderRequest request) {
    return ApiResponse.success(orderService.createOrder(request));
}

public class OrderRequest {
    @NotBlank(message = "用户ID不能为空")
    private String userId;

    @NotNull(message = "金额不能为空")
    @DecimalMin(value = "0.01", message = "金额必须大于0")
    private BigDecimal amount;

    @NotBlank(message = "地址不能为空")
    @Size(max = 200, message = "地址不能超过200字符")
    private String address;
}
```

**正例 B**（同样合规）：代码内手动校验，适用于复杂/跨字段联合校验场景。

```java
@PostMapping("/orders")
public ApiResponse<OrderVO> createOrder(@RequestBody OrderRequest request) {
    if (StringUtils.isBlank(request.getUserId())) {
        throw new BusinessException("用户ID不能为空");
    }
    if (request.getAmount() == null || request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
        throw new BusinessException("金额必须大于0");
    }
    if (StringUtils.isBlank(request.getAddress()) || request.getAddress().length() > 200) {
        throw new BusinessException("地址不能为空且不能超过200字符");
    }
    return ApiResponse.success(orderService.createOrder(request));
}
```

**常见遗漏模式**：

| 模式 | 说明 |
|------|------|
| `@RequestBody` 无 `@Valid` 且方法体内无手动校验 | 请求体校验不生效，空值/超长/非法格式直接穿透 |
| `@RequestParam`/`@PathVariable` 无约束且无手动校验 | 路径参数/查询参数未校验，如 ID 为空或非数字 |
| 字段无 `@NotNull`/`@NotBlank`/`@Size` 等且无对应 `if` 校验 | 必填字段无约束，超长字段无上限 |
| 枚举字段无 `@Pattern` 或自定义校验且无手动枚举校验 | 传入非法枚举值导致后续 NPE 或逻辑异常 |
| 集合字段无 `@NotEmpty`/`@Size` 且无手动校验 | 空集合或超长集合直接进入业务逻辑 |
| 嵌套对象无 `@Valid` 且无对内层字段的手动校验 | 外层校验生效但内层对象字段不校验 |

> `@Valid` 与 `@Validated` 的区别——`@Valid` 支持嵌套校验（需在内嵌对象字段上再加 `@Valid`）；`@Validated` 支持分组校验。建议在 Controller 参数上使用 `@Validated`，内嵌对象字段上使用 `@Valid`。

### 2. 敏感数据传输未加密

**反例**：密码、身份证号、银行卡号等敏感信息以明文在请求/响应中传输。

```java
@PostMapping("/login")
public ApiResponse<LoginResult> login(@RequestBody LoginRequest request) {
    return ApiResponse.success(authService.login(request.getPassword()));
}

public class LoginRequest {
    @NotBlank
    private String username;
    @NotBlank
    private String password;
}

public class UserVO {
    private String idCard;
    private String bankCardNo;
    private String phone;
}
```

**正例**：敏感字段加密传输，响应中脱敏处理。

```java
public class LoginRequest {
    @NotBlank
    private String username;
    @NotBlank
    private String encryptedPassword;
}

public class UserVO {
    private String idCardMasked;
    private String bankCardMasked;
    private String phoneMasked;
}
```

**常见敏感数据类型**：

| 数据类型 | 传输要求 | 响应要求 |
|---------|---------|---------|
| 密码 | 必须加密传输（RSA/SM2 等） | 禁止返回 |
| 身份证号 | 加密传输 | 脱敏显示（`310***********1234`） |
| 银行卡号 | 加密传输 | 脱敏显示（`**** **** **** 1234`） |
| 手机号 | 可明文传输（HTTPS） | 脱敏显示（`138****1234`） |
| 邮箱 | 可明文传输（HTTPS） | 脱敏显示（`j***@example.com`） |

> 静态边界：是否「敏感数据」需结合业务语义判断，静态审查只识别典型敏感字段（字段名含 password/pwd/idCard/bankCard/secret/token 等），标为「建议评估」而非强制。非典型字段需人工确认。

### 3. 接口设计不合理/拆分不恰当

**常见可疑模式**：

| 模式 | 说明 |
|------|------|
| 胖接口（God Endpoint） | 单个接口承担过多职责，如同时处理创建、更新、删除 |
| 返回数据过多 | 接口返回了调用方不需要的大量字段，浪费带宽、增加序列化开销 |
| 混合操作接口 | 同一接口既做查询又做修改，违反 HTTP 语义 |
| 过度耦合 | 接口强依赖多个下游服务，任一下游不可用则整体失败 |
| 批量与单个混用 | 同一接口同时支持单条和批量操作，参数结构复杂 |
| 接口粒度过细 | 简单的 CRUD 操作拆成过多接口，增加调用复杂度 |
| 业务逻辑写在 Controller | Controller 里出现业务处理、数据校验、数据库操作，未下沉到 Service |

**反例 1**：胖接口——一个接口处理多种不相关操作。

```java
@PostMapping("/users/manage")
public ApiResponse<Void> manageUser(@RequestBody UserManageRequest request) {
    switch (request.getAction()) {
        case "create": userService.create(request); break;
        case "update": userService.update(request); break;
        case "delete": userService.delete(request); break;
        case "disable": userService.disable(request); break;
        case "resetPassword": userService.resetPassword(request); break;
    }
    return ApiResponse.success();
}
```

**正例 1**：按操作拆分为独立接口。

```java
@PostMapping("/users")
public ApiResponse<UserVO> createUser(@RequestBody @Valid UserCreateRequest request) { ... }

@PutMapping("/users/{id}")
public ApiResponse<UserVO> updateUser(@PathVariable Long id, @RequestBody @Valid UserUpdateRequest request) { ... }

@DeleteMapping("/users/{id}")
public ApiResponse<Void> deleteUser(@PathVariable Long id) { ... }

@PutMapping("/users/{id}/status")
public ApiResponse<Void> disableUser(@PathVariable Long id, @RequestBody @Valid UserStatusRequest request) { ... }

@PutMapping("/users/{id}/password/reset")
public ApiResponse<Void> resetPassword(@PathVariable Long id) { ... }
```

**反例 2**：返回数据过多——列表接口返回完整实体。

```java
@GetMapping("/users")
public ApiResponse<List<User>> listUsers() {
    return ApiResponse.success(userMapper.selectAll());
}
```

**正例 2**：列表接口返回精简 VO，详情接口返回完整 VO。

```java
@GetMapping("/users")
public ApiResponse<PageResult<UserListItemVO>> listUsers(
        @RequestParam(defaultValue = "1") int pageNum,
        @RequestParam(defaultValue = "20") int pageSize) {
    return ApiResponse.success(userService.pageQuery(pageNum, pageSize));
}

@GetMapping("/users/{id}")
public ApiResponse<UserDetailVO> getUserDetail(@PathVariable Long id) {
    return ApiResponse.success(userService.getDetail(id));
}
```

**反例 3**：混合操作接口——GET 接口修改数据。

```java
@GetMapping("/users/{id}/activate")
public ApiResponse<Void> activateUser(@PathVariable Long id) {
    userService.activate(id);
    return ApiResponse.success();
}
```

**正例 3**：修改操作使用 POST/PUT/PATCH，符合 HTTP 语义。

```java
@PutMapping("/users/{id}/status")
public ApiResponse<Void> activateUser(@PathVariable Long id, @RequestBody @Valid UserStatusRequest request) {
    userService.updateStatus(id, request);
    return ApiResponse.success();
}
```

**反例 4**：业务逻辑写在 Controller——Controller 内含数据校验、库存计算与通知发送。

```java
@PostMapping("/orders")
public ApiResponse<OrderVO> createOrder(@RequestBody OrderRequest request) {
    if (request.getItems() == null || request.getItems().isEmpty()) {
        return ApiResponse.fail(1001, "订单项不能为空");
    }
    int total = request.getItems().stream().mapToInt(OrderItem::getPrice).sum();
    orderMapper.insert(new Order(request.getUserId(), total));
    stockMapper.deduct(request.getItems());
    smsClient.send(request.getUserId(), "下单成功");
    return ApiResponse.success(new OrderVO(total));
}
```

**正例 4**：Controller 只接收参数与封装响应，业务逻辑下沉到 Service。

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

### 4. 接口返回格式不统一

**反例**：不同接口返回格式不一致，有的包装 `ApiResponse`，有的直接返回对象，有的返回 `ResponseEntity`。

```java
@GetMapping("/users/{id}")
public User getUser(@PathVariable Long id) {
    return userService.getUser(id);
}

@GetMapping("/orders/{id}")
public ApiResponse<OrderVO> getOrder(@PathVariable Long id) {
    return ApiResponse.success(orderService.getOrder(id));
}

@PostMapping("/payments")
public ResponseEntity<PaymentResult> createPayment(@RequestBody PaymentRequest request) {
    return ResponseEntity.ok(paymentService.create(request));
}
```

**正例**：统一返回格式，所有接口使用同一包装类。

```java
@GetMapping("/users/{id}")
public ApiResponse<UserVO> getUser(@PathVariable Long id) {
    return ApiResponse.success(userService.getUser(id));
}

@GetMapping("/orders/{id}")
public ApiResponse<OrderVO> getOrder(@PathVariable Long id) {
    return ApiResponse.success(orderService.getOrder(id));
}

@PostMapping("/payments")
public ApiResponse<PaymentResult> createPayment(@RequestBody @Valid PaymentRequest request) {
    return ApiResponse.success(paymentService.create(request));
}
```

**统一返回格式规范**：

```java
public class ApiResponse<T> {
    private int code;
    private String message;
    private T data;

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(0, "success", data);
    }

    public static <T> ApiResponse<T> fail(int code, String message) {
        return new ApiResponse<>(code, message, null);
    }
}
```

**常见不一致模式**：

| 模式 | 说明 |
|------|------|
| 直接返回实体对象 | 无统一包装，前端无法区分成功/失败 |
| 混用 `ResponseEntity` 和自定义包装 | 响应结构不一致，前端需适配多种格式 |
| 错误码不统一 | 有的用 HTTP 状态码，有的用业务码，有的混用 |
| 分页格式不统一 | 有的用 `Page<T>`，有的用 `PageResult<T>`，字段名不一致 |
| 异常响应格式不统一 | 有的返回 JSON，有的返回 HTML 错误页 |

---

## 快速决策提示

- **「参数校验了吗」**：接口参数既无 `@Valid`/`@Validated` + 约束注解，方法体内也无手动校验 → Major，要求补充校验（注解或手动均可）。
- **「敏感数据加密了吗」**：请求/响应中包含密码/身份证/银行卡等敏感字段且未加密/脱敏 → Critical，要求加密传输或脱敏返回。
- **「接口设计合理吗」**：胖接口/返回数据过多/混合操作/过度耦合 → Minor，要求拆分或重构。
- **「分层对了吗」**：Controller 中含业务逻辑、数据校验或数据库操作 → Minor，要求下沉到 Service。
- **「返回格式统一吗」**：同一项目内接口返回格式不一致 → Nit，建议统一。
