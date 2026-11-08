# DSH 账号登录：通过 SSH 隧道切换账号的手册

## 结论

**当前安装的 DSH 账号登录只接受本机 HTTP 回调地址**（`http://localhost|127.0.0.1|[::1]:<端口>`）。从远程 HTTPS 域名（如 `https://dsh.xuekai.top:8888`）点击登录，会在请求上游登录服务前就被本地校验拒绝，返回 `account: protocol`；`gateway/internal` 只是外层包装。

因此切换 DSH 账号的做法是：**电脑经 SSH 隧道 → 服务器本机 HTTP 地址完成登录**，登录后手机继续使用原 HTTPS 域名。不修改 DSH 监听地址、不修改 Lucky 反代、不修改宿主插件产物。

## 当前部署事实（2026-11-08 实测）

| 项 | 值 |
|---|---|
| DSH 页面（手机/电脑） | `https://dsh.xuekai.top:8888/`，Lucky HTTPS 反代 |
| 服务器 SSH | `ssh -p 1994 xuekai@192.168.11.111` |
| DSH 监听 | 仅 `192.168.11.111:2007`（node，未监听 `127.0.0.1`） |
| SSH 转发策略 | `/etc/ssh/sshd_config.d/trim_sshd.conf` 含 `AllowTcpForwarding no` |

部署或端口变化时以 `sudo ss -lntp 'sport = :2007'` 的 Local Address 为准，不要假定是 `127.0.0.1`。

## 切换账号完整步骤

### 1. 服务器：临时开放定向转发

在 [trim_sshd.conf](/etc/ssh/sshd_config.d/trim_sshd.conf) 保留 `AllowTcpForwarding no`，在末尾追加：

```sshconfig
Match User xuekai
    AllowTcpForwarding local
    PermitOpen 192.168.11.111:2007
Match all
```

检查并生效（服务名以实际为准，`ssh` 或 `sshd`）：

```bash
sudo /usr/sbin/sshd -t && sudo systemctl reload ssh
```

只对 `xuekai` 开放本地转发，且目标仅限 DSH 端口，不给其他用户或任意目标开放。

### 2. 电脑：建立隧道

```bash
ssh -p 1994 -N -o ExitOnForwardFailure=yes -L 127.0.0.1:18888:192.168.11.111:2007 xuekai@192.168.11.111
```

`-N` 表示不执行远程命令，终端无输出并保持挂起是正常的；结束用 `Ctrl+C`。输入密码为正常现象。

### 3. 电脑：登录

浏览器打开 **http://localhost:18888**，在 DSH 中切换/登录账号。

### 4. 手机：确认

手机刷新 `https://dsh.xuekai.top:8888/`，确认账号已切换、权益生效。账号凭据由服务器端 DSH 保存，不依赖隧道持续运行。

### 5. 收尾：收回临时转发（建议）

关闭电脑隧道，删除第 1 步追加的 `Match User xuekai` 整段，保留 `AllowTcpForwarding no`，再次执行：

```bash
sudo /usr/sbin/sshd -t && sudo systemctl reload ssh
```

手机继续用原域名，**不要退出 DSH 账号**。

## 常见错误对照

| 现象 | 原因 | 处理 |
|---|---|---|
| `account: protocol` | 从 HTTPS 远程域名发起登录 | 改用本手册隧道流程 |
| `administratively prohibited: open failed` | 服务器 `AllowTcpForwarding no` | 按第 1 步追加自定义策略并 reload |
| `connect failed: Connection refused` | 隧道目标地址不对，如 `127.0.0.1:2007` | 改成 `ss` 显示的监听地址（如 `192.168.11.111:2007`） |
| 手机登录仍失败 | 隧道只服务所连 DSH 实例 | 确认隧道连到同一实例与配置 |

## 重要决策

- 不改 DSH 内置插件的登录校验，不实现远程 HTTPS 回调，避免越权扩大宿主改动。
- 不修改 Lucky 或 DSH 监听地址；只临时调整 SSH 转发策略，用完即撤。
- 不把 token、密码或完整凭据写入本文档或仓库。

## 验证记录

2026-11-08 用户实测：从 `https://dsh.xuekai.top:8888` 登录报 `account: protocol`；经上述隧道访问 `http://localhost:18888` 完成登录，用户反馈“可以了”。SSH 转发策略的追加与回滚由用户手动执行，回滚状态以服务器 [trim_sshd.conf](/etc/ssh/sshd_config.d/trim_sshd.conf) 实际内容为准。

## 限制

- 账号过期后需重新走本流程；手机无法直接完成该登录（需手机端支持本地端口转发的 SSH 客户端）。
- 未修改 DSH、Lucky 配置，也未对账号权益变化做程序化验证。
