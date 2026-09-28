# Java/Spring 安全编码专项清单

> 本清单由 `SKILL.md` 在识别到 Spring Boot / Spring Cloud / MyBatis 技术栈时加载，作为安全维度的深度检查项。严重度已按 `review-rubric.md` 的四级定义统一标注。

## 检查顺序

1. 注入与危险 API（SQL/XXE/命令/反序列化）——最高优先，可直接利用
2. 访问控制与越权（鉴权缺失/IDOR/CSRF）——逻辑漏洞
3. 敏感数据与加密（硬编码密钥/弱算法/日志泄漏）——数据泄漏
4. 文件与路径安全（路径遍历/Zip Slip/上传下载）
5. XSS 与输出编码
6. 会话与 Cookie
7. 错误与信息泄漏
8. 网络与配置暴露

## 检查项清单（40 条）

### 注入与执行（5 条）

| 关注点 | 严重度 |
|--------|--------|
| SQL 注入：字符串拼接 SQL、MyBatis `${}`、原生 SQL 未绑定参数 | Critical |
| XML/XXE 注入：未禁用外部实体 | Critical |
| 命令注入：`Runtime.exec`/`ProcessBuilder` 含未净化参数 | Critical |
| LDAP/XPath/模板/SpEL 注入（按栈启用） | Critical |
| 反序列化漏洞：`ObjectInputStream`、不安全 JSON 多态（`autoType`/`enableDefaultTyping`） | Critical |

### 访问控制（5 条）

| 关注点 | 严重度 |
|--------|--------|
| 接口未鉴权或 `permitAll` 过宽 | Critical |
| 水平/垂直越权：仅信前端或参数 role | Critical |
| IDOR：资源 ID 来自请求且无归属校验 | Critical |
| 缺少方法级权限注解的写操作 | Minor |
| CSRF 防护缺失或全局关闭 | Minor |

### 输入输出（5 条）

| 关注点 | 严重度 |
|--------|--------|
| 跨信任边界输入无校验 | Minor |
| XSS：未编码输出、`th:utext`、危险 HTML 拼接 | Minor |
| 日志注入/敏感信息入日志 | Minor |
| 格式化字符串含用户输入 | Minor |
| CRLF/HTTP 头注入 | Minor |

### 文件与路径（4 条）

| 关注点 | 严重度 |
|--------|--------|
| 路径遍历：`../`、未 normalize | Critical |
| Zip Slip：解压未校验 entry 路径与压缩比 | Critical |
| 上传：无类型/大小校验、文件名直用 | Critical |
| 下载：未鉴权、路径用户可控 | Critical |

### 加密与密钥（6 条）

| 关注点 | 严重度 |
|--------|--------|
| 硬编码口令/密钥/Token | Critical |
| 弱算法 DES/MD5/SHA1 用于口令或完整性 | Critical |
| 口令存储无 salt / 未用 BCrypt/Argon2 | Critical |
| 弱随机数生成会话/验证码 | Critical |
| 明文 Socket 传敏感数据 | Minor |
| 禁用证书校验 / TrustAll | Minor |

### 会话与 Cookie（3 条）

| 关注点 | 严重度 |
|--------|--------|
| Cookie 未设 HttpOnly | Minor |
| Cookie 未设 Secure | Minor |
| Session 超时异常或未在登录后轮换 | Minor |

### 错误与信息泄漏（4 条）

| 关注点 | 严重度 |
|--------|--------|
| 异常栈/内部路径返回客户端 | Critical |
| Actuator/Swagger/调试接口生产暴露 | Critical |
| 响应中泄露版本号、物理路径 | Minor |
| 临时文件未删除 | Nit |

### 网络与逻辑（4 条）

| 关注点 | 严重度 |
|--------|--------|
| SSRF：服务端请求用户可控 URL | Critical |
| 开放重定向 | Minor |
| CORS 过宽 `allowedOrigins("*")` | Minor |
| 不安全 HTTP 方法 PUT/DELETE 匿名可访问 | Minor |

### 运行与配置（4 条）

| 关注点 | 严重度 |
|--------|--------|
| 信任环境变量未校验 | Minor |
| JMX/远程监控无认证 | Minor |
| 生产 Profile 仍启用 H2 Console、debug 端点 | Minor |
| 外部进程阻塞无超时 | Nit |

---

## 正反例（用于快速对照）

### 1. SQL 注入

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

### 2. XXE 注入

**反例**：`DocumentBuilderFactory.newInstance()` 未禁用外部实体。

**正例**：

```java
factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
factory.setXIncludeAware(false);
factory.setExpandEntityReferences(false);
```

### 3. 命令注入

**反例**：`Runtime.getRuntime().exec("ping " + userInput);`

**正例**：白名单校验 + 参数数组：`new ProcessBuilder("ping", "-c", "1", host)`，配合 `Pattern.compile("^[a-zA-Z0-9.-]+$")` 校验。

### 4. 反序列化漏洞

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

### 5. 访问控制

**5a. 接口未鉴权 / permitAll 过宽**

**反例**：`antMatchers("/**").permitAll()` / `anyRequest().permitAll()` / 写操作 Controller 无 `@PreAuthorize`

**正例**：默认拒绝 + 显式放行：`antMatchers("/api/public/**").permitAll()` → `.anyRequest().authenticated()`

**5b. IDOR**

**反例**：`orderService.getById(id)` — 请求 ID 直查库，无归属校验

**正例**：`orderService.getByIdAndUserId(id, currentUserId)` — 校验当前用户对资源的归属关系

**5c. CSRF**

**反例**：`http.csrf().disable()` 且使用 Cookie Session 认证

**正例**：`http.csrf().csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())`；JWT 无状态 API 可关闭但需注释说明。

### 6. 文件与路径安全

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

### 7. 加密与密钥安全

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

### 8. XSS / 输出编码

**反例**：`<div th:utext="${userInput}">` / `return "<h1>Hello, " + name + "!</h1>"`

**正例**：`<div th:text="${userInput}">` / `HtmlUtils.htmlEscape(name, "UTF-8")`

### 9. 日志注入与敏感信息

**反例**：`log.info("User input: " + userInput)` / `log.info("password={}", pwd)` / `log.info("idCard={}", idCard)`

**正例**：`log.info("User input: {}", sanitizeForLog(userInput))` — 敏感字段脱敏或禁止记录；换行符替换 `input.replace('\n', '_').replace('\r', '_')`

### 10. 错误与信息泄漏

**10a. 异常栈返回客户端**

**反例**：`@ExceptionHandler` 返回 `e.getMessage()` + `e.getStackTrace()`

**正例**：`log.error("系统异常", e); return ApiResponse.fail(500, "系统繁忙，请稍后重试");`

> 与 `java-code-quality.md` 分工：code-quality 关注异常处理的通用规范；security 关注异常处理导致的**信息泄漏**。

**10b. Actuator/Swagger/调试接口暴露**

**反例**：`management.endpoints.web.exposure.include=*` / Swagger 无 `@Profile` 限制 / `/debug` 控制器无 `@Profile`

**正例**：`include: "health,info"` + `show-details: when-authorized` / `@Profile("!prod")` 限制 Swagger / 调试端点加 `@Profile("dev")`

**10c. 临时文件未删除**

`createTempFile` 未 `deleteOnExit()` 或 finally 中删除。

### 11. 网络安全

**11a. SSRF**

**反例**：`restTemplate.getForObject(userUrl, String.class)` — URL 完全来自用户输入

**正例**：URL 白名单 `Set.of("api.example.com")` + 内网 IP 校验

**11b. 开放重定向**

**反例**：`return "redirect:" + url` — URL 来自用户输入

**正例**：白名单校验 `ALLOWED_REDIRECT_DOMAINS.contains(URI.create(url).getHost())`

**11c. CORS 过宽**

**反例**：`@CrossOrigin(origins = "*")` / `config.addAllowedOrigin("*")`

**正例**：`@CrossOrigin(origins = {"https://app.example.com"})`

### 12. 会话与 Cookie

**反例**：`http-only: false` / `secure: false` / `timeout: -1`

**正例**：`http-only: true` / `secure: true` / `same-site: lax` / `timeout: 30m`

### 13. CRLF / HTTP 头注入

**反例**：`response.setHeader("Content-Disposition", "attachment; filename=" + filename)` — 用户输入直设响应头

**正例**：`filename.replaceAll("[\\r\\n]", "")` + 正则校验后再设头

### 14. 运行与配置

| 关注点 | 反例 | 正例 |
|--------|------|------|
| 信任环境变量 | `System.getenv("DB_PWD")` 无校验直用 | 校验非空 + 格式 |
| JMX/远程监控 | `spring.boot.admin` 无认证 | 加认证或关闭 |
| 生产 debug 端点 | H2 Console `enabled: true` / `/debug` 无 `@Profile` | `enabled: false` / `@Profile("dev")` |
| 外部进程阻塞 | `process.waitFor()` 无超时 | `process.waitFor(5, TimeUnit.SECONDS)` |

---

## 静态边界说明

| 类别 | 说明 |
|------|------|
| **可审（高置信）** | SQL 注入、XXE、命令注入、硬编码密钥、弱算法、IDOR 模式、路径遍历、Zip Slip、反序列化危险 API、TrustAll、CORS 过宽、Cookie 属性、异常栈暴露、Actuator 暴露 |
| **部分可审** | CSRF（需确认认证方式）、XSS（需渲染上下文）、上传（需部署目录配置）、SSRF（需网络层）、文件权限、Session 轮换（需流程） |
| **不可审（仅提示）** | 暴力破解防护、用户名枚举、会话固定、密码明文传输（需抓包）、Slow HTTP、逻辑漏洞（需设计评审） |

对「部分可审」项标为高危可疑并注明「需配置/运行时佐证」；对「不可审」项输出「需渗透/运维/人工」提示，不报假阳性。

## 快速决策提示

- **「有注入吗」**：SQL 拼接 / `${}` / `Runtime.exec` 拼用户输入 / `ObjectInputStream` / `enableDefaultTyping` → Critical。
- **「鉴权够吗」**：`permitAll("/**")` / 写操作无 `@PreAuthorize` / ID 直查无归属校验 → Critical。
- **「密钥安全吗」**：源码/yml 明文密码 / DES/MD5 口令 / 无 salt / `Random` 生成 token → Critical。
- **「文件安全吗」**：用户输入拼文件路径 / 解压无路径校验 / 上传无白名单 → Critical。
- **「信息泄漏了吗」**：异常栈返回前端 / Actuator 全暴露 / 日志含密码 → Critical。
- **「CSRF 关了吗」**：`csrf().disable()` + Cookie Session 认证 → Minor。
- **「XSS 有吗」**：`th:utext` / HTML 拼用户输入 → Minor。
- **「CORS 过宽吗」**：`allowedOrigins("*")` → Minor。
- **「SSRF 可能吗」**：`RestTemplate` URL 来自参数 → Critical。
- **检查项外发现**：不属于上述 40 条但确属高危的安全问题（新型漏洞、框架特有缺陷、业务逻辑漏洞），也必须报出，标注「检查项外发现」并说明判定依据，不得因不在清单中而忽略。
