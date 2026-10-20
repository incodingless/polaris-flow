# 安全检查清单

## 一、通用清单（任何语言）

以下清单按风险类别组织，是安全维度的**入口速查**：审查时逐类对照，命中即记录位置并评估严重级别，再按 §二 取该类目的完整检查项与正反例。安全类问题一律按「安全从严」原则，不因不确定而降级。

> 颗粒度说明：本节是「入口速查」的 **7 类粗切**，§二 是 **8 组细切**，二者**不一一对应**——§二 的「会话 & Cookie」并入本节 3、「错误处理 & 信息泄露」并入本节 2、「网络外部请求与跨域」并入本节 1（SSRF / 开放重定向）与本节 3（CORS / 不安全 HTTP 方法）、「运行环境与进程」并入本节 7。本节另有 §二 未单列的两项——**依赖 CVE**（5）与 **资源与可用性**（7）。各类目的完整检查项、严重度与正反例以 §二 为准。

### 1. 注入类（Injection）

| 类型 | 常见危险模式 | 检查要点 |
|------|-------------|----------|
| SQL 注入 | 字符串拼接 SQL、`"SELECT ... " + userInput` | 是否使用参数化查询/ORM 绑定；拼接是否含用户输入 |
| 命令注入 | `os.system()`、`subprocess(... shell=True)`、`child_process.exec()`、`eval()` | 命令是否拼接了不可信输入 |
| XSS | 直接 `innerHTML`、未转义输出用户内容 | 前端是否对用户输入做了转义 |
| 模板注入 | 用户输入进入模板引擎（SSTI） | 模板变量是否可信 |
| XXE | XML 解析未禁用外部实体（DTD） | 是否关闭 DTD 与外部实体 |
| LDAP / XPath / 表达式注入 | 用户输入进入 LDAP 过滤器、XPath、SpEL 等表达式引擎 | 是否参数化 / 白名单（按技术栈启用） |
| 日志注入 / 格式化串 | 用户输入拼进日志，或进入 `printf` / `String.format` 的格式串 | 是否用占位符、换行是否转义 |
| CRLF / HTTP 头注入 | 用户输入直设响应头（如 `Content-Disposition`） | 是否过滤 `\r` `\n` |
| SSRF | 服务端请求的 URL 完全来自用户输入 | URL 是否白名单、是否禁内网段 |
| 开放重定向 | `redirect:` + 用户输入 | 跳转目标是否白名单 |

- 通用：跨信任边界的输入是否都做了校验（白名单优先于黑名单）。

### 2. 敏感信息泄露（Secrets）

- 硬编码密钥：`password = "..."`、`api_key = "..."`、`secret = "..."`、`token = "..."`（排除 `process.env`、`os.environ` 等环境变量引用）
- 密钥写进日志：`console.log(token)`、`logger.info(password)`
- 密钥提交进版本库：历史提交中是否包含 `.env`、`*.pem`、`id_rsa`
- 响应侧泄露：异常栈 / 内部路径返回客户端，响应中含版本号、物理路径

### 3. 认证与授权（Authentication & Authorization）

- 缺失鉴权：接口/路由未做身份校验
- 越权（IDOR）：直接使用客户端传入的 `userId` 查询资源，未校验归属
- 默认口令：存在默认/硬编码的管理员口令
- CSRF：写操作（状态变更接口）无 CSRF 防护或全局关闭
- Cookie 属性：会话 Cookie 未设 `HttpOnly` / `Secure` / `SameSite`
- 会话生命周期：会话令牌可预测、可明文存储、超时异常，或登录后未轮换
- 跨域与 HTTP 方法：`Access-Control-Allow-Origin` 过宽 / 反射任意源；`PUT` / `DELETE` 等匿名可访问

### 4. 加密误用（Cryptography）

- 弱哈希：使用 MD5、SHA-1 存储密码
- 自研加密：自行实现的加密算法（应使用标准库）
- 硬编码 IV/盐：初始化向量或盐写死
- 明文存储：密码/身份证号等敏感数据明文落库
- 弱随机数：用 `Random` 生成 token / 验证码 / 密钥（应使用 `SecureRandom`）
- 禁用证书校验：`TrustAll` / 空 `X509TrustManager` / 明文 Socket 传敏感数据

### 5. 依赖与反序列化（Dependencies & Deserialization）

- 已知漏洞依赖：引用了存在 CVE 的库版本
- 不可信反序列化：反序列化用户可控的数据（`pickle.loads`、`ObjectInputStream`）

### 6. 文件与路径（File & Path）

- 路径穿越：文件路径拼接用户输入，未做 `../` 校验
- 任意文件读写：上传/下载接口未限制路径与类型
- 未限制上传：上传的文件类型、大小无校验，且存储到可执行目录
- Zip Slip：解压未校验 entry 路径与压缩比
- 下载无鉴权：下载接口路径用户可控、未做归属校验
- 临时文件未删除：临时文件未在 `finally` 或 `deleteOnExit` 中清理

### 7. 资源、可用性与运行环境（Resource, Availability & Runtime）

- 无界循环/递归：用户输入可触发死循环或栈溢出
- 未限流：对外接口无速率限制
- 大对象未释放：缓存/集合无上限增长
- 信任环境变量：`getenv` 等取值未校验即用于连接 / 鉴权
- 外部进程无超时：`waitFor()` 等阻塞调用未设超时

---

## 二、Web 与网络安全清单（OWASP，语言无关）

> **分工声明（三档归属）**：本清单检查项按《CodeReview核心分工原则》三档归属——**规则层**（SEC-01~05、07~09、15~16、19~28、30、32~36；§三 SEC-F02~F04）：Sonar/脚本可判定，AI 只引用结论不逐条复扫；**重叠**（SEC-06、11、14、17、29、31；§三 SEC-F01）：规则检出即定论，AI 只解释成因与补佐证，静态边界为「部分可审」的按 rubric 不计分；**AI 主导**（SEC-10、12、13、18）：规则做不了，AI 逐项核查。语义面与 AI 主导条目的审查指引见 `ai-checklist.md`。
>
> **加载条件**：本文件属**规则对照组**，日常精读不加载（日常精读用 `ai-checklist.md`）。加载时机：① Sonar 经用户确认跳过后的 AI 兜底核查；② 规则误报申诉核对；③ 重叠项佐证核对。
>
> **规则与语言无关**：括号内的 API 是常见信号（示例以 Java/Spring 为主），其他语言按同一规则判、换用本语言对应的 API 与配置。命中项以本段严重度为准；Java/Spring **框架特有**的检查项收在 §三，本节不重复。
>
> **编号约定**：§二 检查项编号 `SEC-01`～`SEC-36`（按组连续），§三 编号 `SEC-F01`～`SEC-F04`；§一 入口速查不编号，引用时一律指向 §二/§三 编号。编号供报告「违反约定」字段与记录格式引用，判定文字与严重度以本表为准。

### 1. 各类注入 & 反序列化（外部输入解析执行风险）

| 编号 | 关注点 | 严重度 |
|---|---|---|
| SEC-01 | SQL 注入：字符串拼接 SQL、动态 SQL / 模板占位未绑定参数（如 MyBatis `${}`） | Critical |
| SEC-02 | XML/XXE 注入：未禁用外部实体 | Critical |
| SEC-03 | 命令注入：不可信输入拼进系统命令（`Runtime.exec` / `ProcessBuilder`、`os.system` / `child_process.exec`） | Critical |
| SEC-04 | LDAP/XPath/ 模板 / 表达式（SpEL 等）注入 —— 按技术栈启用 | Critical |
| SEC-05 | 反序列化漏洞：反序列化不可信数据（`ObjectInputStream`、Jackson`enableDefaultTyping`、Fastjson `autoType`、Python `pickle`） | Critical |
| SEC-06 | XSS：未编码输出、危险 HTML 渲染（`th:utext`、`innerHTML`） | Minor |
| SEC-07 | 日志注入 / 敏感信息入日志 | Minor |
| SEC-08 | 格式化字符串含用户输入 | Minor |
| SEC-09 | CRLF/HTTP 头注入 | Minor |
| SEC-10 | 跨信任边界输入无校验 | Minor |

### 2. 访问控制 & 权限越权（鉴权授权业务逻辑）

| 编号 | 关注点 | 严重度 |
|---|---|---|
| SEC-11 | 接口未鉴权，或默认放行 / 白名单过宽（如 `permitAll("/**")`） | Critical |
| SEC-12 | 水平 / 垂直越权：仅信前端或参数 role | Critical |
| SEC-13 | IDOR：资源 ID 来自请求且无归属校验 | Critical |
| SEC-14 | CSRF 防护缺失或全局关闭 | Minor |

### 3. 文件、上传下载与压缩（本地文件资源攻击面）

| 编号 | 关注点 | 严重度 |
|---|---|---|
| SEC-15 | 路径遍历：`../`、未 normalize | Critical |
| SEC-16 | Zip Slip：解压未校验 entry 路径与压缩比 | Critical |
| SEC-17 | 上传：无类型 / 大小校验、文件名直用 | Critical |
| SEC-18 | 下载：未鉴权、路径用户可控 | Critical |
| SEC-19 | 临时文件未删除 | Nit |

### 4. 加密、密钥与随机数（密码学风险域）

| 编号 | 关注点 | 严重度 |
|---|---|---|
| SEC-20 | 硬编码口令 / 密钥 / Token | Critical |
| SEC-21 | 弱算法 DES/MD5/SHA1 用于口令或完整性 | Critical |
| SEC-22 | 口令存储无 salt / 未用 BCrypt/Argon2 | Critical |
| SEC-23 | 弱随机数生成会话 / 验证码 | Critical |
| SEC-24 | 明文 Socket 传敏感数据 | Minor |
| SEC-25 | 禁用证书校验 / TrustAll | Minor |

### 5. 会话 & Cookie（客户端身份凭证管理）

| 编号 | 关注点 | 严重度 |
|---|---|---|
| SEC-26 | Cookie 未设 HttpOnly | Minor |
| SEC-27 | Cookie 未设 Secure | Minor |
| SEC-28 | Session 超时异常或未在登录后轮换 | Minor |

### 6. 错误处理 & 信息泄露（返回响应侧泄露内部信息）

| 编号 | 关注点 | 严重度 |
|---|---|---|
| SEC-29 | 异常栈 / 内部路径返回客户端 | Critical |
| SEC-30 | 响应中泄露版本号、物理路径 | Minor |

### 7. 网络外部请求与跨域（对外发起请求、HTTP 安全配置）

| 编号 | 关注点 | 严重度 |
|---|---|---|
| SEC-31 | SSRF：服务端请求用户可控 URL | Critical |
| SEC-32 | 开放重定向 | Minor |
| SEC-33 | CORS 过宽（`Access-Control-Allow-Origin: *`） | Minor |
| SEC-34 | 不安全 HTTP 方法 PUT/DELETE 匿名可访问 | Minor |

### 8. 运行环境与进程（应用运行时环境风险）

| 编号 | 关注点 | 严重度 |
|---|---|---|
| SEC-35 | 信任环境变量未校验 | Minor |
| SEC-36 | 外部进程阻塞无超时 | Nit |

### 正反例（用于快速对照）

#### 1. SQL 注入

**反例**：

```java
String sql = "SELECT * FROM user WHERE id = " + userId;           // 字符串拼接
String sql = "SELECT * FROM user WHERE name = '" + name + "'";    // 字符串拼接
```

```xml
<select id="findUser">SELECT * FROM user WHERE name = '${name}'</select>  <!-- MyBatis ${} -->
<select id="findByColumn">SELECT * FROM user ORDER BY ${orderBy}</select>  <!-- 动态排序 -->
```

**正例**：

```java
jdbcTemplate.query("SELECT * FROM user WHERE id = ?", rowMapper, userId);  // 参数化
```

```xml
<select id="findUser">SELECT * FROM user WHERE name = #{name}</select>    <!-- MyBatis #{} -->
```

动态排序/表名必须白名单校验：`private static final Set<String> ALLOWED_COLUMNS = Set.of("id", "name", "create_time");`

#### 2. XXE 注入

**反例**：`DocumentBuilderFactory.newInstance()` 未禁用外部实体。

**正例**：

```java
factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
factory.setXIncludeAware(false);
factory.setExpandEntityReferences(false);
```

#### 3. 命令注入

**反例**：`Runtime.getRuntime().exec("ping " + userInput);`

**正例**：白名单校验 + 参数数组：`new ProcessBuilder("ping", "-c", "1", host)`，配合 `Pattern.compile("^[a-zA-Z0-9.-]+$")` 校验。

#### 4. 反序列化漏洞

**反例**：

```java
new ObjectInputStream(inputStream).readObject();                    // Java 原生
new ObjectMapper().enableDefaultTyping().readValue(json, Object.class); // Jackson
JSONObject.parseObject(json, Feature.SupportAutoType);               // Fastjson
```

**正例**：

```java
// Jackson 白名单
mapper.activateDefaultTyping(
    BasicPolymorphicTypeValidator.builder().allowIfBaseType(MyBaseClass.class).build(),
    ObjectMapper.DefaultTyping.NON_FINAL);
// Fastjson 关闭 autoType
ParserConfig.getGlobalInstance().setAutoTypeSupport(false);
ParserConfig.getGlobalInstance().addAccept("com.myapp.");
```

#### 5. 访问控制

**5a. 接口未鉴权 / 默认放行过宽**

**反例**：`antMatchers("/**").permitAll()` / `anyRequest().permitAll()` / 路由未做身份校验

**正例**：默认拒绝 + 显式放行：`antMatchers("/api/public/**").permitAll()` → `.anyRequest().authenticated()`

**5b. IDOR**

**反例**：`orderService.getById(id)` — 请求 ID 直查库，无归属校验

**正例**：`orderService.getByIdAndUserId(id, currentUserId)` — 校验当前用户对资源的归属关系

**5c. CSRF**

**反例**：`http.csrf().disable()` 且使用 Cookie Session 认证

**正例**：`http.csrf().csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())`；JWT 无状态 API 可关闭但需注释说明。

#### 6. 文件与路径安全

**6a. 路径遍历 + Zip Slip**

**反例**：

```java
new File("/data/files/" + filename)                    // 路径遍历
new File(outputDir, entry.getName())                   // Zip Slip
```

**正例**：

```java
Path basePath = Paths.get("/data/files").toAbsolutePath().normalize();
Path filePath = basePath.resolve(filename).normalize();
if (!filePath.startsWith(basePath)) throw ...;          // 路径遍历防护
// Zip Slip 同理：resolve(entry.getName()).normalize() 后 startsWith 校验
```

**6b. 文件上传**

**反例**：`file.getOriginalFilename()` 直用 → 无扩展名白名单 / 无大小限制 / 文件名直拼路径

**正例**：扩展名白名单 `Set.of("jpg","png","pdf")` + MIME 校验 + 大小限制 + `UUID.randomUUID()` 重命名

#### 7. 加密与密钥安全

**7a. 硬编码密钥**

**反例**：源码 `private static final String DB_PASSWORD = "root123"` / yml `password: root123`

**正例**：yml `password: ${DB_PASSWORD}` 环境变量注入

检索信号：`password=` / `sk-` / `AKIA` / `secretKey` / `Authorization: Basic` / `jdbc:mysql://user:pwd@`

**7b. 弱算法 + 无 salt + 弱随机数**

| 禁止 | 推荐 |
|------|------|
| `MD5`/`SHA1`（任何用途） | `SHA-256`/`SHA-512`（完整性校验） |
| `DES`/`3DES`/`AES/ECB`（加密） | `AES/GCM`（加密） |
| 裸 `MessageDigest`/`DigestUtils.md5Hex`（口令存储） | `BCryptPasswordEncoder(12)`/`Argon2`（口令存储，内置 salt） |
| `new Random().nextInt()`（token/验证码） | `new SecureRandom()`（安全场景） |

> `Random` 用于非安全场景（随机排序、测试数据）可接受；用于 token/验证码/密钥生成则高危。

**7c. 明文 Socket / TrustAll**

**反例**：`Socket` 传敏感数据 / 自定义 `X509TrustManager` 空 check / `setDefaultHostnameVerifier((h,s)->true)`

**正例**：使用 `SSLSocket` / 默认证书校验 / 仅 `@Profile("test")` 下配置自定义 TrustManager

#### 8. XSS / 输出编码

**反例**：`<div th:utext="${userInput}">` / `return "<h1>Hello, " + name + "!</h1>"`

**正例**：`<div th:text="${userInput}">` / `HtmlUtils.htmlEscape(name, "UTF-8")`

#### 9. 日志注入与敏感信息

**反例**：`log.info("User input: " + userInput)` / `log.info("password={}", pwd)` / `log.info("idCard={}", idCard)`

**正例**：`log.info("User input: {}", sanitizeForLog(userInput))` — 敏感字段脱敏或禁止记录；换行符替换 `input.replace('\n', '_').replace('\r', '_')`

#### 10. 错误与信息泄漏

**10a. 异常栈返回客户端**

**反例**：`@ExceptionHandler` 返回 `e.getMessage()` + `e.getStackTrace()`

**正例**：`log.error("系统异常", e); return ApiResponse.fail(500, "系统繁忙，请稍后重试");`

> 与 `java-code-quality.md` 分工：code-quality 关注异常处理的通用规范；security 关注异常处理导致的**信息泄漏**。

**10b. 临时文件未删除**

`createTempFile` 未 `deleteOnExit()` 或 finally 中删除。

#### 11. 网络安全

**11a. SSRF**

**反例**：`restTemplate.getForObject(userUrl, String.class)` — URL 完全来自用户输入

**正例**：URL 白名单 `Set.of("api.example.com")` + 内网 IP 校验

**11b. 开放重定向**

**反例**：`return "redirect:" + url` — URL 来自用户输入

**正例**：白名单校验 `ALLOWED_REDIRECT_DOMAINS.contains(URI.create(url).getHost())`

**11c. CORS 过宽**

**反例**：`@CrossOrigin(origins = "*")` / `config.addAllowedOrigin("*")`

**正例**：`@CrossOrigin(origins = {"https://app.example.com"})`

#### 12. 会话与 Cookie

**反例**：`http-only: false` / `secure: false` / `timeout: -1`

**正例**：`http-only: true` / `secure: true` / `same-site: lax` / `timeout: 30m`

#### 13. CRLF / HTTP 头注入

**反例**：`response.setHeader("Content-Disposition", "attachment; filename=" + filename)` — 用户输入直设响应头

**正例**：`filename.replaceAll("[\\r\\n]", "")` + 正则校验后再设头

#### 14. 配置与运行环境

| 关注点 | 反例 | 正例 |
|--------|------|------|
| 信任环境变量 | `System.getenv("DB_PWD")` 无校验直用 | 校验非空 + 格式 |
| 外部进程阻塞 | `process.waitFor()` 无超时 | `process.waitFor(5, TimeUnit.SECONDS)` |

### 静态边界说明

| 类别 | 说明 |
|------|------|
| **可审（高置信）** | SQL 注入、XXE、命令注入、硬编码密钥、弱算法、IDOR 模式、路径遍历、Zip Slip、反序列化危险 API、TrustAll、CORS 过宽、Cookie 属性、异常栈暴露、Actuator 暴露（§三） |
| **部分可审** | CSRF（需确认认证方式）、XSS（需渲染上下文）、上传（需部署目录配置）、SSRF（需网络层）、文件权限、Session 轮换（需流程） |
| **不可审（仅提示）** | 暴力破解防护、用户名枚举、会话固定、密码明文传输（需抓包）、Slow HTTP、逻辑漏洞（需设计评审） |

对「部分可审」项标为高危可疑并注明「需配置/运行时佐证」；对「不可审」项输出「需渗透/运维/人工」提示，不报假阳性。「部分可审」项按 `review-rubric.md` §评分与结论的计分排除规则**不计入总体评分与合并建议**，报告单列「待人工确认」。

### 快速决策提示

- **「有注入吗」**：SQL 拼接 / `${}` / `Runtime.exec` 拼用户输入 / `ObjectInputStream` / `enableDefaultTyping` → Critical。
- **「鉴权够吗」**：`permitAll("/**")` / 写操作无 `@PreAuthorize`（§三）/ ID 直查无归属校验 → Critical。
- **「密钥安全吗」**：源码/yml 明文密码 / DES/MD5 口令 / 无 salt / `Random` 生成 token → Critical。
- **「文件安全吗」**：用户输入拼文件路径 / 解压无路径校验 / 上传无白名单 → Critical。
- **「信息泄漏了吗」**：异常栈返回前端 / Actuator 全暴露（§三）/ 日志含密码 → Critical。
- **「CSRF 关了吗」**：`csrf().disable()` + Cookie Session 认证 → Minor。
- **「XSS 有吗」**：`th:utext` / HTML 拼用户输入 → Minor。
- **「CORS 过宽吗」**：`allowedOrigins("*")` → Minor。
- **「SSRF 可能吗」**：`RestTemplate` URL 来自参数 → Critical。
- **检查项外发现**：不属于 §二 编号段（SEC-01～SEC-36）/ §三 编号段（SEC-F01～SEC-F04）但确属高危的安全问题（新型漏洞、框架特有缺陷、业务逻辑漏洞），也必须报出，标注「检查项外发现」并说明判定依据，不得因不在清单中而忽略。

---

## 三、Java/Spring 专有项

> 仅列 Java/Spring 生态**特有**的检查项——框架/注解/配置层面才有对应物的问题。通用风险面（注入/访问控制/加密/文件/会话/网络/配置）见 §二，本节不重复。严重度同用 `review-rubric.md` 的四级定义；静态边界与快速决策口径同 §二，不另立一套。

### 检查项清单

| 编号 | 关注点 | 严重度 |
|--------|--------|--------|
| SEC-F01 | 写操作缺少方法级权限注解（`@PreAuthorize`/`@Secured`），仅靠 URL 层规则兜底 | Minor |
| SEC-F02 | Actuator/Swagger 生产暴露（`include: *`、无 `@Profile` 限制） | Critical |
| SEC-F03 | JMX / 远程监控端点无认证（如 `spring.boot.admin`） | Minor |
| SEC-F04 | 生产 Profile 仍启用 H2 Console、debug 端点 | Minor |

### 正反例

#### 1. 方法级权限注解缺失

- **反例**：写操作 Controller 无 `@PreAuthorize`，仅靠 `SecurityFilterChain` 的 URL 规则兜底
- **正例**：`@PreAuthorize("hasRole('ADMIN')")` 或 `@Secured("ROLE_ADMIN")`

#### 2. Actuator / Swagger 生产暴露

- **反例**：`management.endpoints.web.exposure.include=*` / Swagger 无 `@Profile` 限制
- **正例**：`include: "health,info"` + `show-details: when-authorized` / `@Profile("!prod")`

#### 3. JMX / 远程监控无认证

- **反例**：`spring.boot.admin` 无认证
- **正例**：加认证或关闭

#### 4. 生产 Profile 调试端点

- **反例**：H2 Console `enabled: true` / `/debug` 控制器无 `@Profile`
- **正例**：H2 `enabled: false` / `@Profile("dev")`

---

## 检查结果记录格式

`§一` / `§二` / `§三` 命中项统一按以下格式记录，供报告引用（编号取 §二/§三 检查项编号；`§一` 速查命中或检查项外发现无编号时省略编号段）：

```
[类别·编号] 位置（文件:行） - 具体模式描述 - 建议严重级别
```

示例：
```
[注入类·SEC-01] src/user.js:42 - SQL 语句通过字符串拼接用户输入 - Critical
[敏感信息·SEC-20] config.py:7 - 硬编码数据库密码 - Critical
[检查项外] src/order.js:18 - 业务规则缺陷：退款金额未校验负数 - Major
```
