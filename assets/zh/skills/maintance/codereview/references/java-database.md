# Java/Spring 数据库与事务专项清单

## 检查顺序

1. 风险面：无条件删改、SQL 拼接、超大 IN、无分页的大表扫描。
2. 正确性：事务边界、AOP 是否生效（代理链、可见性、自调用、吞异常）、传播与 `REQUIRES_NEW`、写操作 `rollbackFor`、异步与事务。
3. 性能与可维护：`select *`、嵌套子查询、N+1、逻辑删除策略。
4. Spring Cloud：跨服务写库的一致性方案是否与实际风险匹配。

## 检查项清单（19 条）

### 数据库操作（9 条）

| 关注点 | 严重度 |
|--------|--------|
| 无 WHERE 的 UPDATE/DELETE（或条件可被绕过） | Critical |
| `IN` 参数过多（如 >1000 需分批） | Major |
| 不必要嵌套/关联、可下推的条件未下推 | Major |
| 未使用连接池 / 池参数未按环境调优 | Major |
| 大表全量拉取、未分页 | Major |
| `SELECT *`、宽行浪费 | Minor |
| 不必要 DB 函数、可应用层完成的计算 | Minor |
| 物理删除 vs 业务要求的逻辑删除 | Minor |
| 表结构、字段类型、索引与查询模式是否匹配 | Minor |

### 事务管理（10 条）

| 关注点 | 严重度 |
|--------|--------|
| 该原子化的多写操作未包事务 | Critical |
| 在类上大面积 `@Transactional` | Major |
| 在 Controller 加事务 | Major |
| 写库相关 `@Transactional` 未显式 `rollbackFor = Exception.class` | Major |
| 同类 `this` 自调用带 `@Transactional` 的方法，未经过 Spring 代理 | Major |
| `@Transactional` 打在非 `public` 或 `static` 方法上 | Major |
| 方法内 `try/catch` 吞掉异常或未再抛出，切面按正常路径提交 | Major |
| 带事务逻辑的类未被 Spring 托管（`new` / 非 Bean） | Major |
| 跨服务多写：仅本地事务却假设全局原子 | Minor |
| `@Async` / 消息监听 / 线程池任务中的事务边界 | Minor |

---

## 正反例（用于快速对照）

### 1. 动态条件防误删改

**反例**：`<where>` + `<if>` 组合，条件全空时 WHERE 缺失 → 全表更新。

```xml
<update id="batchUpdateStatus">
  UPDATE t_order SET status = #{status}
  <where>
    <if test="idList != null and idList.size() > 0">
      id IN <foreach collection="idList" item="id" open="(" separator="," close=")">#{id}</foreach>
    </if>
  </where>
</update>
```

**正例**：Java 侧校验集合非空 + XML 直接写死 WHERE（无 WHERE 则拒绝执行）。

```java
if (idList == null || idList.isEmpty()) { throw new IllegalArgumentException("idList must not be empty"); }
```

### 2. 禁止 `${}` 拼接 SQL（防注入）

**反例**：`WHERE name = '${name}'` — 字符串直接代入，等同拼接。

**正例**：`WHERE name = #{name}` — 预编译参数。

若必须 `${}`（动态表名/排序列等）：传入前必须白名单校验或应用层映射到安全字面量，禁止未校验用户原文直接进 `${}`。

### 3. `IN` 列表过大

审查侧重：列表是否可能无界增长；对无上限来源强制分批或改表关联。

**正例**：按批拆分（每批 500～1000）或改用临时表 + JOIN。

```java
for (List<Long> chunk : Lists.partition(allIds, 500)) { mapper.updateByIds(chunk, status); }
```

### 4. `SELECT *` 与大结果集

**反例**：`SELECT *` + 无 LIMIT/分页。

**正例**：列裁剪 + 分页插件/RowBounds + 合理 ORDER BY 与索引；导出类用流式/游标。

### 5. 循环查库（N+1）

**反例**：

```java
for (Order o : orders) { o.setItems(itemMapper.findByOrderId(o.getId())); }
```

**正例**：批量 IN 查询 + 内存组装，或 JOIN/子查询（数据膨胀时用两步查）。

### 6. 连接池

**反例**：DriverManager 新建连接；池大小远大于 DB 承载且无超时/泄漏防护。

**正例**：池化数据源；实例数 × 池大小 ≤ DB max_connections；配 connection-timeout、max-lifetime、minimum-idle。

### 7. `@Transactional` 边界与 `rollbackFor`

- 类级/Controller 事务：长事务拖住只读与 IO，回滚语义混乱 → 下移到必要写操作的 Service 方法。
- 写库未声明 `rollbackFor`：Spring 默认仅回滚 RuntimeException/Error，受检异常抛出后事务仍提交。

**反例**：

```java
@Transactional
public void persist(Order o) throws IOException { mapper.insert(o); }
```

**正例**：写操作方法声明 `rollbackFor = Exception.class`；只读用 `readOnly = true`。

```java
@Transactional(rollbackFor = Exception.class)
public void create(Order o) { ... }
```

### 8. 自调用绕过事务

**反例**：同类 `this.create()` 调用带 `@Transactional` 方法 → AOP 不生效。

**正例**：拆到另一 Bean / ApplicationContext 获取代理 / 提取到独立组件。

### 9. 传播行为与嵌套

**反例**：`REQUIRED` 下内层吞异常，外层仍提交 → 部分成功。

**正例**：明确「谁回滚」：内层是否 `REQUIRES_NEW`、异常是否重抛、`rollbackFor` 是否含业务异常类型。

### 10. Spring Cloud 与分布式事务

**反例**：服务 A 写本地 + Feign 调服务 B 写库，仅各自 `@Transactional` 当全局事务。

**正例**：按业务选 Saga/TCC/本地消息表/Outbox/Seata；能接受最终一致则避免重分布式事务。

### 11. 异步与事务

**反例**：`@Transactional` 方法内 `@Async` 启动任务，子线程无原事务却假设同一连接。

**正例**：异步线程内单独开事务；需「提交后投递」用 `TransactionSynchronizationManager.registerSynchronization` 或 Spring 事件 `afterCommit`。

### 12. 其他「事务不生效」场景

| 场景 | 说明 |
|------|------|
| 非 `public`/`static` | 代理模式不织入 → 改 `public` 实例方法或 AspectJ |
| 非 Spring Bean | `new` / 未加 `@Service` → 无代理无事务 |
| 吞异常未抛出 | `catch` 后仅 log 未 throw → 事务仍提交，应用 `setRollbackOnly()` 或重抛 |
| 只读库路由错误 | 写操作落只读从库 → 与读写分离配置相关时重点看 |

---

## 静态边界说明

- 「是否慢、是否缺索引」类结论：**有只读库/MCP 时**用执行计划佐证（`EXPLAIN` 或等价），再下「全表扫描/缺索引」结论；**仅静态阅读时**只标可疑写法（深翻页、大表无过滤等），不写死「已慢/已缺索引」。
- 「是否大表」依赖行数、增长与库表统计，静态扫不出来；无库时对「面向用户/运营的海量列表却无任何分页或硬上限」标 Major 可疑，字典类小表勿机械套用。
- 「表结构/索引是否匹配」无 DDL/元数据时无法从代码扫出真实列类型，最多标零散可疑点（对字符串列做算术、隐式类型转换），其余写「需与建表脚本或 DBA 核对」。

## 快速决策提示

- **「删改有没有 WHERE」**：无可靠主键/条件 → Critical。
- **「事务在哪一层」**：Controller 或类级默认 → Major，要求下移到合适粒度的 Service 方法。
- **「写库是否声明 rollbackFor」**：写操作仅有默认 `@Transactional`、无 `rollbackFor = Exception.class` → Major。
- **「事务是否真的挂上」**：自调用、`private`/`static`、吞异常、非 Bean、异步子线程 → 按失效场景标 Major，并指到 §8/§9/§11/§12。
- **「跨服务多写」**：无协调机制 → 标一致性风险（Minor），不夸大单数据源 `@Transactional` 的能力。
