# Java/Spring 性能优化专项清单

> 本清单由 `SKILL.md` 在识别到 Spring Boot / Spring Cloud / MyBatis 技术栈时加载，作为性能维度的深度检查项。严重度已按 `review-rubric.md` 的四级定义统一标注。

## 检查顺序

1. 高危面：循环中调用远程 API、循环中查询数据库（N+1）、大数据量无分页。
2. 中危面：内存泄漏风险、缺少批量处理、缓存缺失、递归/while 无保护开关。
3. 低危面：递归改迭代、日志性能影响。

## 检查项清单（10 条）

| 关注点 | 严重度 |
|--------|--------|
| 在循环中调用远程 API（HTTP/Feign/RPC 等），逐条网络往返 | Major |
| 在循环中查询数据库（N+1），逐条 SQL 往返 | Major |
| 数据量过大时未做分页处理，一次拉取全量 | Major |
| 存在内存泄漏风险（资源未关闭、集合无限增长、静态容器未清理等） | Major |
| 应批量处理的操作仍逐条执行（批量插入/更新/删除） | Minor |
| 经常查询、较少修改的数据未使用缓存 | Minor |
| 递归代码未加保护开关（无最大深度/终止条件兜底） | Minor |
| `while` 循环代码未加保护开关（无最大迭代次数/超时兜底） | Minor |
| 日志记录对性能的影响（循环内高频日志、大对象序列化、异步日志配置不当等） | Nit |
| 递归代码是否需要改成迭代（栈深度可控、尾递归优化等） | Nit |

---

## 正反例

### 1. 循环中调用远程 API / 数据库

**反例**：循环内逐条远程调用或逐条查库，N 条数据产生 N 次网络/SQL 往返。

```java
// 循环中逐条远程调用
for (Order order : orders) {
    UserDTO user = userClient.getUser(order.getUserId());
    ProductDTO product = productClient.getProduct(order.getProductId());
}
// 循环中逐条查库（N+1）
for (Long id : orderIds) {
    Order order = orderMapper.selectById(id);
    List<OrderItem> items = orderItemMapper.selectByOrderId(id);
}
```

**正例**：批量查询 + 内存 Map 组装，将 N 次调用降为常数次。

```java
Map<Long, UserDTO> userMap = userClient.batchGetUsers(userIds)
        .stream().collect(Collectors.toMap(UserDTO::getId, Function.identity()));
List<Order> orders = orderMapper.selectByIds(orderIds);
Map<Long, List<OrderItem>> itemMap = orderItemMapper.selectByOrderIds(orderIds)
        .stream().collect(Collectors.groupingBy(OrderItem::getOrderId));
```

若远程服务不提供批量接口，可用 `CompletableFuture` + 限流并行化，但需注意下游承载能力。

### 2. 大数据量无分页

**反例**：列表接口一次拉取全量。

```java
@GetMapping("/orders")
public List<Order> listOrders() { return orderMapper.selectAll(); }
```

**正例**：分页查询 + 上限保护；全量导出用流式/游标查询。

```java
@GetMapping("/orders")
public PageResult<Order> listOrders(
        @RequestParam(defaultValue = "1") int pageNum,
        @RequestParam(defaultValue = "20") int pageSize) {
    if (pageSize > 500) pageSize = 500;
    return orderService.pageQuery(pageNum, pageSize);
}
```

### 3. 内存泄漏风险

常见模式：静态集合只增不删、ThreadLocal 未清理、资源未关闭、缓存无上限、监听器未注销。

**反例**：

```java
// 静态 Map 只增不删
private static final Map<String, RequestContext> CONTEXT_MAP = new ConcurrentHashMap<>();
public static void track(String id, RequestContext ctx) { CONTEXT_MAP.put(id, ctx); }

// ThreadLocal 未在 finally 清理
executor.submit(() -> { currentUser.set(user); doWork(); });
```

**正例**：

```java
// 使用带淘汰策略的缓存
private static final Cache<String, RequestContext> CACHE = Caffeine.newBuilder()
        .maximumSize(10_000).expireAfterWrite(Duration.ofMinutes(30)).build();

// finally 中清理 ThreadLocal
executor.submit(() -> { try { currentUser.set(user); doWork(); } finally { currentUser.remove(); } });
```

### 4. 缺少批量处理

**反例**：逐条插入，每条一次 SQL。

```java
for (OrderItem item : items) { orderItemMapper.insert(item); }
```

**正例**：MyBatis 批量插入（`<foreach>` 拼接 VALUES），大数据量分批执行。

```java
for (List<OrderItem> chunk : Lists.partition(items, 500)) {
    orderItemMapper.batchInsert(chunk);
}
```

### 5. 缓存缺失

**反例**：每次请求查库获取字典数据。

```java
@GetMapping("/cities")
public List<City> listCities() { return cityMapper.selectAll(); }
```

**正例**：引入缓存（Caffeine/Redis），设置过期与刷新策略。

```java
private final Cache<String, List<City>> cityCache = Caffeine.newBuilder()
        .expireAfterWrite(Duration.ofHours(1)).refreshAfterWrite(Duration.ofMinutes(30))
        .build(this::loadCitiesFromDb);
public List<City> getAllCities() { return cityCache.get("all"); }
```

### 6. 递归 / while 未加保护开关

**反例**：递归无最大深度、while 无最大迭代。

```java
// 递归无深度限制
public CategoryTree buildTree(Long parentId) {
    List<Category> children = categoryMapper.selectByParentId(parentId);
    for (Category child : children) buildTree(child.getId());
}

// while 无迭代上限
while (nextCursor != null) {
    Page<Record> page = remoteApi.fetchPage(nextCursor);
    nextCursor = page.getNextCursor();
}
```

**正例**：加最大深度/迭代次数兜底。

```java
// 递归加深度限制
public CategoryTree buildTree(Long parentId, int depth) {
    if (depth > MAX_TREE_DEPTH) throw new IllegalStateException("exceeds max depth");
    List<Category> children = categoryMapper.selectByParentId(parentId);
    for (Category child : children) buildTree(child.getId(), depth + 1);
}

// while 加迭代上限
int iterations = 0;
while (nextCursor != null && iterations < MAX_ITERATIONS) {
    Page<Record> page = remoteApi.fetchPage(nextCursor);
    nextCursor = page.getNextCursor();
    iterations++;
}
```

### 7. 日志对性能的影响

**反例**：循环内字符串拼接/序列化日志，即使级别未开启也产生开销。

```java
for (Order order : orders) { log.debug("Processing: " + JSON.toJSONString(order)); }
```

**正例**：参数化日志 + `isDebugEnabled()` 守卫；生产环境用异步 Appender。

```java
for (Order order : orders) {
    if (log.isDebugEnabled()) { log.debug("Processing: {}", order.getId()); }
}
```

### 8. 递归改迭代

**反例**：深度不可控的递归。

```java
public long fibonacci(int n) { if (n <= 1) return n; return fibonacci(n - 1) + fibonacci(n - 2); }
```

**正例**：改为迭代，栈深度可控。

```java
public long fibonacci(int n) {
    if (n <= 1) return n;
    long prev2 = 0, prev1 = 1;
    for (int i = 2; i <= n; i++) { long cur = prev1 + prev2; prev2 = prev1; prev1 = cur; }
    return prev1;
}
```

---

## 静态边界说明

「是否一定泄漏/一定慢」多为运行时行为，静态审查只能识别典型可疑模式。有监控/压测/堆转储时应结合佐证；纯静态时只标可疑写法，不写死「已泄漏/已慢」。

## 快速决策提示

- **循环里有没有远程调用/查库**：循环体内出现 Feign/HTTP/`mapper.select*` 等 → Major，要求改为批量。
- **列表接口有没有分页**：返回 `List<X>` 且无分页参数 → Major，要求加分页或上限。
- **静态集合/ThreadLocal 有没有清理**：`static Map` 只 `put` 无 `remove`、`ThreadLocal` 未在 `finally` 清理 → Major。
- **字典/配置数据有没有缓存**：高频查询低频修改的字典/配置类数据每次查库 → Minor，建议评估。
- **递归/while 有没有兜底**：递归无最大深度、`while` 无最大迭代 → Minor。
- **循环内日志有没有守卫**：循环内 `log.debug("..." + obj)` → Nit，提示参数化或守卫。
