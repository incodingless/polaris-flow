# Java/Spring 并发与线程安全专项清单

> 本清单由 `SKILL.md` 在识别到 Spring Boot / Spring Cloud / MyBatis 技术栈时加载，作为正确性维度中「并发与竞态」的深度检查项。严重度已按 `review-rubric.md` 的四级定义统一标注。

## 检查顺序

1. 高危面：直接 new 线程、线程安全问题（共享可变状态无同步）、并发工具类误用。
2. 中危面：异步操作的数据一致性、死锁风险。

## 检查项清单（5 条）

### 线程创建与管理（1 条）

| 关注点 | 严重度 |
|--------|--------|
| 直接 `new Thread()` / `new Runnable()` 启动线程，未使用线程池 | Major |

### 线程安全（1 条）

| 关注点 | 严重度 |
|--------|--------|
| 共享可变状态（实例字段、静态字段、缓存）在多线程下无同步保护，存在竞态条件 | Major |

### 并发工具类（1 条）

| 关注点 | 严重度 |
|--------|--------|
| 未正确使用 `java.util.concurrent` 包下的并发工具类（选型错误、用法错误、遗漏） | Major |

### 异步与一致性（1 条）

| 关注点 | 严重度 |
|--------|--------|
| 异步操作（`@Async`、`CompletableFuture`、线程池任务）的数据一致性未保证 | Minor |

### 死锁风险（1 条）

| 关注点 | 严重度 |
|--------|--------|
| 多锁场景下锁序不一致或嵌套加锁，存在死锁风险 | Minor |

---

## 正反例（用于快速对照）

### 1. 直接 new 线程，未使用线程池

**反例**：直接 `new Thread().start()`，无法复用、无法控制并发数、无法统一监控与异常处理。

```java
public void processData(Data data) {
    new Thread(() -> heavyWork(data)).start();
}
```

**正例**：Spring Boot 项目通过 `@Async` + 自定义 `ThreadPoolTaskExecutor` Bean。

```java
@Configuration
@EnableAsync
public class AsyncConfig {
    @Bean("dataProcessExecutor")
    public Executor dataProcessExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(20);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("data-process-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
}

@Service
public class DataProcessService {
    @Async("dataProcessExecutor")
    public void processData(Data data) { heavyWork(data); }
}
```

> `new Thread(task).start()`、匿名内部类 `new Thread() { ... }.start()` 等变体同理，均需替换为线程池。`Runtime.getRuntime().addShutdownHook(new Thread(...))` 可接受，但业务线程不应如此。

### 2. 线程安全问题

常见可疑模式：

| 模式 | 说明 |
|------|------|
| 实例可变字段 + 多线程访问 | Spring 单例 Bean 中的可变实例字段，被 `@Async`/定时任务/多个请求并发读写 |
| 静态可变字段 + 多线程访问 | `static Map`/`static List` 被多线程并发修改且无同步 |
| `SimpleDateFormat` 共享 | 非线程安全 → 改用 `DateTimeFormatter` |
| `HashMap` 并发写 | 并发 `put` 可能死循环或数据丢失 → 改用 `ConcurrentHashMap` |
| `ArrayList` 并发写 | 并发 `add` 可能数组越界或数据丢失 → 改用 `CopyOnWriteArrayList` |
| `check-then-act` 竞态 | 先检查再操作，中间可能被其他线程打断 |
| `long`/`double` 非原子读 | 64 位基本类型在 32 位 JVM 上读写非原子 |

**反例 1**：Spring 单例 Bean 中的可变实例字段。

```java
@Service
public class OrderService {
    private int counter = 0;
    public void process() { counter++; }
}
```

**正例 1**：使用 `AtomicInteger`。

```java
@Service
public class OrderService {
    private final AtomicInteger counter = new AtomicInteger(0);
    public void process() { counter.incrementAndGet(); }
}
```

**反例 2**：`check-then-act` 竞态。

```java
public class OrderService {
    private final Map<String, Order> orderCache = new ConcurrentHashMap<>();
    public Order getOrCreate(String orderId) {
        if (!orderCache.containsKey(orderId)) {
            orderCache.put(orderId, new Order(orderId));
        }
        return orderCache.get(orderId);
    }
}
```

**正例 2**：使用 `ConcurrentHashMap.computeIfAbsent` 原子操作。

```java
public class OrderService {
    private final Map<String, Order> orderCache = new ConcurrentHashMap<>();
    public Order getOrCreate(String orderId) {
        return orderCache.computeIfAbsent(orderId, Order::new);
    }
}
```

### 3. 并发工具类使用

**常见选型错误**：

| 错误选型 | 正确选型 | 说明 |
|---------|---------|------|
| `HashMap` → 并发场景 | `ConcurrentHashMap` | 并发写不安全 |
| `Hashtable` | `ConcurrentHashMap` | 全表锁性能差 |
| `Collections.synchronizedMap` → 高并发 | `ConcurrentHashMap` | 全局锁吞吐低 |
| `ArrayList` → 并发写 | `CopyOnWriteArrayList` / `Collections.synchronizedList` | 视读写比选择 |
| `HashSet` → 并发写 | `ConcurrentHashMap.newKeySet()` / `CopyOnWriteArraySet` | 视读写比选择 |
| `LinkedList` → 并发队列 | `ConcurrentLinkedQueue` | 非阻塞队列 |
| `ArrayList` → 生产者-消费者 | `ArrayBlockingQueue` / `LinkedBlockingQueue` | 阻塞队列 |
| `wait()/notify()` | `CountDownLatch` / `CyclicBarrier` / `Semaphore` / `Condition` | 显式同步工具更清晰 |
| 手动 `synchronized` 计数 | `AtomicInteger` / `AtomicLong` / `LongAdder` | 原子类无锁更高效 |
| `volatile` 复合操作 | `AtomicXxx` | `volatile` 只保证可见性，不保证原子性 |

**常见用法错误**：

| 错误用法 | 说明 |
|---------|------|
| `ConcurrentHashMap` 迭代时修改 | 迭代结果不确定 |
| `AtomicInteger.compareAndSet` 循环内无退路 | 自旋 CAS 无重试上限可能活锁 |
| `CountDownLatch` 未 `countDown` | 异常路径遗漏导致 `await` 永远阻塞，须在 `finally` 中 `countDown` |
| `ReentrantLock` 未在 `finally` 中 `unlock` | 异常路径锁未释放导致死锁 |
| `synchronized` 块内调用外部方法 | 可能引发死锁或长时间持锁 |
| `Thread.sleep()` 做同步 | 应改用 `wait/notify` 或 `CountDownLatch` |

**反例 1**：`ReentrantLock` 未在 `finally` 中释放。

```java
public class OrderService {
    private final ReentrantLock lock = new ReentrantLock();
    public void process() {
        lock.lock();
        doWork();
        lock.unlock();
    }
}
```

**正例 1**：`lock()` 后紧跟 `try-finally`。

```java
public class OrderService {
    private final ReentrantLock lock = new ReentrantLock();
    public void process() {
        lock.lock();
        try { doWork(); } finally { lock.unlock(); }
    }
}
```

**反例 2**：`volatile` 误用于复合操作。

```java
public class OrderService {
    private volatile int counter = 0;
    public void increment() { counter++; }
}
```

**正例 2**：复合操作用 `AtomicInteger`。

```java
public class OrderService {
    private final AtomicInteger counter = new AtomicInteger(0);
    public void increment() { counter.incrementAndGet(); }
}
```

### 4. 异步操作的数据一致性

**反例 1**：`@Async` 方法内写库，异常被吞。

```java
@Service
public class NotificationService {
    @Async
    public void sendNotification(String message) {
        notificationMapper.insert(message);
    }
}
```

**正例 1**：异步方法内自有事务边界 + 异常处理 + 回调机制。

```java
@Service
public class NotificationService {
    @Async("notificationExecutor")
    @Transactional(rollbackFor = Exception.class)
    public void sendNotification(String message) {
        try {
            notificationMapper.insert(message);
        } catch (Exception e) {
            log.error("Notification send failed: {}", message, e);
            failedNotificationMapper.insert(new FailedNotification(message, e.getMessage()));
        }
    }
}
```

**反例 2**：`CompletableFuture` 异常未处理。

```java
public void processAsync() {
    CompletableFuture.runAsync(() -> riskyOperation());
}
```

**正例 2**：链式异常处理 + 超时。

```java
public void processAsync() {
    CompletableFuture.runAsync(() -> riskyOperation(), executor)
            .orTimeout(30, TimeUnit.SECONDS)
            .exceptionally(ex -> { log.error("Async task failed", ex); return null; });
}
```

### 5. 死锁风险

**反例 1**：多锁加锁顺序不一致。

```java
public void transfer(Account from, Account to, BigDecimal amount) {
    synchronized (from) {
        synchronized (to) {
            from.debit(amount);
            to.credit(amount);
        }
    }
}
```

线程 A 调 `transfer(a1, a2, ...)` 先锁 a1 再锁 a2，线程 B 调 `transfer(a2, a1, ...)` 先锁 a2 再锁 a1 → 死锁。

**正例 1**：按全局唯一顺序加锁（如按账户 ID 排序）。

```java
public void transfer(Account from, Account to, BigDecimal amount) {
    Account first = from.getId().compareTo(to.getId()) < 0 ? from : to;
    Account second = first == from ? to : from;
    synchronized (first) {
        synchronized (second) {
            from.debit(amount);
            to.credit(amount);
        }
    }
}
```

**反例 2**：锁内调用外部方法（隐式嵌套）。

```java
public class OrderService {
    private final Object lock = new Object();
    public void process(Order order) {
        synchronized (lock) {
            doWork(order);
            notifyService.send(order);
        }
    }
}
```

**正例 2**：锁内只做必要操作，外部调用移到锁外。

```java
public class OrderService {
    private final Object lock = new Object();
    public void process(Order order) {
        synchronized (lock) { doWork(order); }
        notifyService.send(order);
    }
}
```

---

## 静态边界说明

线程安全/死锁/数据一致性多为运行时行为，静态审查只能识别典型可疑模式，不能断言「一定有竞态/一定会死锁」。对业务语义不明确的共享状态，标为「建议评估」而非强制。

## 快速决策提示

- **「有没有直接 new Thread」**：出现 `new Thread()` / `new Runnable()` + `.start()` → Major，要求改为线程池。
- **「共享可变状态有没有同步」**：Spring 单例 Bean 中的可变实例字段 / `static` 可变字段被多线程访问 → Major，要求加同步或改用线程安全容器。
- **「并发工具类选对了吗」**：`HashMap` 并发写 / `SimpleDateFormat` 共享 / `volatile` 复合操作 / `ReentrantLock` 未 `finally unlock` → Major。
- **「异步操作数据一致吗」**：`@Async` 内写库与调用方事务无协调 / `CompletableFuture` 异常未处理 → Minor。
- **「会不会死锁」**：多锁加锁顺序不一致 / `synchronized` 嵌套 / 锁内调用外部方法 → Minor。
