const https = require("https");
const http = require("http");
const querystring = require("querystring");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// ============ JIRA HOST / SESSION FILE ============
const JIRA_HOST = "10.120.10.129";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0";
const SESSION_FILE = path.join(__dirname, ".jira-session.json");

// ============ LOG WORK PAYLOAD VARIABLES ============
const USERNAME = "JIRAUSER14218";
const TIME_SPEND = 28800;
const REMAINING_TIME = 0;
const DESCRIPTION = "";
const PERIOD = false;
const FIELDS = [{ id: 1, fieldName: "Type Of Work", fieldValue: ["Test"] }];

// ============ HTML UI ============
const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Jira Log Work Tool</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #1e1e2e; color: #cdd6f4; padding: 24px; min-height: 100vh; }
    h1 { margin-bottom: 20px; color: #89b4fa; }
    .form-group { margin-bottom: 16px; }
    label { display: block; margin-bottom: 4px; font-weight: 600; color: #a6adc8; }
    input, select, textarea { width: 100%; padding: 10px 12px; border: 1px solid #45475a; border-radius: 6px; background: #313244; color: #cdd6f4; font-size: 14px; }
    textarea { min-height: 80px; resize: vertical; font-family: 'Cascadia Code', 'Consolas', monospace; font-size: 12px; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: #89b4fa; }
    button { padding: 12px 24px; background: #89b4fa; color: #1e1e2e; border: none; border-radius: 6px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 8px; }
    button:hover { background: #74c7ec; }
    button:disabled { background: #45475a; color: #6c7086; cursor: not-allowed; }
    .progress-container { margin-top: 20px; display: none; }
    .progress-bar { width: 100%; height: 24px; background: #313244; border-radius: 12px; overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #89b4fa, #74c7ec); transition: width 0.3s; width: 0%; }
    .progress-text { margin-top: 6px; font-size: 13px; color: #a6adc8; }
    .log-container { margin-top: 20px; }
    .log-area { width: 100%; height: 320px; background: #11111b; border: 1px solid #45475a; border-radius: 6px; padding: 12px; overflow-y: auto; font-family: 'Cascadia Code', 'Consolas', monospace; font-size: 12px; line-height: 1.6; }
    .log-entry { padding: 2px 0; }
    .log-info { color: #89b4fa; }
    .log-success { color: #a6e3a1; }
    .log-error { color: #f38ba8; }
    .log-warn { color: #f9e2af; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-top: 8px; }
    .status-idle { background: #45475a; color: #a6adc8; }
    .status-running { background: #1e3a5f; color: #89b4fa; }
    .status-done { background: #1e3f2e; color: #a6e3a1; }
    .status-error { background: #3f1e2e; color: #f38ba8; }
    .login-box { background: #181825; border: 1px solid #45475a; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .login-row { display: flex; gap: 16px; }
    .hint { margin-top: 8px; font-size: 12px; color: #6c7086; }
    .token-box { margin-bottom: 16px; border: 1px solid #313244; border-radius: 6px; padding: 8px 12px; }
    .token-box summary { cursor: pointer; color: #a6adc8; font-size: 13px; }
    .token-box .form-group { margin-top: 12px; }
  </style>
</head>
<body>
  <h1>Jira Log Work Tool</h1>

  <div class="login-box">
    <div class="login-row">
      <div class="form-group" style="flex:1">
        <label for="username">Jira Username</label>
        <input type="text" id="username" placeholder="vd: dongnt30" autocomplete="username">
      </div>
      <div class="form-group" style="flex:1">
        <label for="password">Password</label>
        <input type="password" id="password" placeholder="Mật khẩu Jira" autocomplete="current-password">
      </div>
    </div>
    <button id="loginBtn" onclick="login()">Đăng nhập & Lưu token</button>
    <span id="loginStatus" class="status-badge status-idle">Chưa đăng nhập</span>
    <div class="hint" id="sessionHint"></div>
  </div>

  <details class="token-box">
    <summary>Token (tự động điền sau khi đăng nhập — chỉ mở khi cần dán thủ công)</summary>
    <div class="form-group">
      <label for="jsessionid">JSESSIONID</label>
      <input type="text" id="jsessionid" placeholder="Tự điền sau khi đăng nhập...">
    </div>
    <div class="form-group">
      <label for="xsrftoken">XSRF_TOKEN</label>
      <input type="text" id="xsrftoken" placeholder="Tự điền sau khi đăng nhập...">
    </div>
  </details>
  <div class="form-group">
    <label for="project">Project (dự án bạn có quyền truy cập)</label>
    <div style="display:flex; gap:8px; align-items:flex-end;">
      <select id="project" onchange="updateJql()" style="flex:1">
        <option value="">-- Đăng nhập để tải danh sách dự án --</option>
      </select>
      <button type="button" id="reloadProjectsBtn" onclick="loadProjects()" style="margin-top:0; white-space:nowrap;">Tải lại</button>
    </div>
  </div>
  <div class="form-group">
    <label for="jql">JQL Query</label>
    <textarea id="jql"></textarea>
  </div>
  <button id="executeBtn" onclick="execute()">Execute</button>
  <span id="statusBadge" class="status-badge status-idle">Idle</span>

  <div class="progress-container" id="progressContainer">
    <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
    <div class="progress-text" id="progressText">0 / 0</div>
  </div>

  <div class="log-container">
    <label>Message Log</label>
    <div class="log-area" id="logArea"></div>
  </div>

  <script>
    // Sinh JQL từ project key đang chọn. Đã thêm assignee = currentUser();
    // ô JQL vẫn sửa được tự do sau khi sinh.
    function buildJql(projectKey) {
      if (!projectKey) return '';
      return 'project = "' + projectKey + '" AND assignee = currentUser()'
        + ' AND issuetype in subTaskIssueTypes() AND status = Done'
        + ' AND "End date" >= startOfMonth() AND "End date" <= endOfMonth()'
        + ' AND timespent is EMPTY'
        + ' ORDER BY cf[10108] DESC, priority DESC, updated DESC';
    }

    function updateJql() {
      const projectKey = document.getElementById('project').value;
      document.getElementById('jql').value = buildJql(projectKey);
    }

    // Tải danh sách dự án người dùng có quyền truy cập, đổ vào dropdown.
    async function loadProjects() {
      const jsessionid = document.getElementById('jsessionid').value.trim();
      const xsrftoken = document.getElementById('xsrftoken').value.trim();
      const select = document.getElementById('project');
      const btn = document.getElementById('reloadProjectsBtn');
      if (!jsessionid || !xsrftoken) {
        log('Cần đăng nhập (hoặc có token) trước khi tải danh sách dự án', 'warn');
        return;
      }
      btn.disabled = true;
      log('Đang tải danh sách dự án...', 'info');
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsessionid, xsrftoken })
        });
        const data = await res.json();
        if (!data.ok) {
          log('Không tải được dự án: ' + data.error, 'error');
          btn.disabled = false;
          return;
        }
        const prev = select.value;
        select.innerHTML = '<option value="">-- Chọn dự án --</option>';
        data.projects.forEach(function (p) {
          const opt = document.createElement('option');
          opt.value = p.key;
          opt.textContent = p.name + ' (' + p.key + ')';
          select.appendChild(opt);
        });
        if (prev && data.projects.some(function (p) { return p.key === prev; })) {
          select.value = prev;
        }
        updateJql();
        log('Đã tải ' + data.projects.length + ' dự án', 'success');
      } catch (err) {
        log('Lỗi tải dự án: ' + err.message, 'error');
      }
      btn.disabled = false;
    }

    function setLoginStatus(status, text) {
      const badge = document.getElementById('loginStatus');
      badge.className = 'status-badge status-' + status;
      badge.textContent = text;
    }

    // Nạp token đã lưu để tự điền sẵn.
    async function loadSavedSession() {
      try {
        const res = await fetch('/api/session');
        const s = await res.json();
        if (s && s.jsessionid) {
          document.getElementById('jsessionid').value = s.jsessionid;
          document.getElementById('xsrftoken').value = s.xsrftoken || '';
          if (s.username) document.getElementById('username').value = s.username;
          setLoginStatus('done', 'Đã có token đã lưu');
          const when = s.savedAt ? new Date(s.savedAt).toLocaleString() : '';
          document.getElementById('sessionHint').textContent =
            'Token đã lưu' + (when ? ' lúc ' + when : '') + '. Nếu Jira báo lỗi 401/403 thì đăng nhập lại để làm mới.';
          loadProjects();
        }
      } catch (e) {}
    }

    async function login() {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const btn = document.getElementById('loginBtn');
      if (!username || !password) {
        setLoginStatus('error', 'Thiếu username/mật khẩu');
        return;
      }
      btn.disabled = true;
      setLoginStatus('running', 'Đang đăng nhập...');
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.ok) {
          document.getElementById('jsessionid').value = data.jsessionid;
          document.getElementById('xsrftoken').value = data.xsrftoken;
          document.getElementById('password').value = '';
          setLoginStatus('done', 'Đăng nhập thành công');
          const when = data.savedAt ? new Date(data.savedAt).toLocaleString() : '';
          document.getElementById('sessionHint').textContent =
            'Đã lưu token vào .jira-session.json' + (when ? ' lúc ' + when : '') + '.';
          log('Đăng nhập & lưu token thành công cho ' + data.username, 'success');
          loadProjects();
        } else {
          setLoginStatus('error', 'Đăng nhập lỗi');
          log('Lỗi đăng nhập: ' + data.error, 'error');
        }
      } catch (err) {
        setLoginStatus('error', 'Lỗi kết nối');
        log('Lỗi kết nối khi đăng nhập: ' + err.message, 'error');
      }
      btn.disabled = false;
    }

    // Initialize on load
    document.addEventListener('DOMContentLoaded', function () {
      updateJql();
      loadSavedSession();
    });

    function log(msg, type = 'info') {
      const area = document.getElementById('logArea');
      const entry = document.createElement('div');
      entry.className = 'log-entry log-' + type;
      entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
      area.appendChild(entry);
      area.scrollTop = area.scrollHeight;
    }

    function setStatus(status, text) {
      const badge = document.getElementById('statusBadge');
      badge.className = 'status-badge status-' + status;
      badge.textContent = text;
    }

    function setProgress(current, total) {
      const container = document.getElementById('progressContainer');
      container.style.display = 'block';
      const fill = document.getElementById('progressFill');
      const text = document.getElementById('progressText');
      const pct = total > 0 ? (current / total * 100) : 0;
      fill.style.width = pct + '%';
      text.textContent = current + ' / ' + total;
    }

    async function execute() {
      const jsessionid = document.getElementById('jsessionid').value.trim();
      const xsrftoken = document.getElementById('xsrftoken').value.trim();
      const project = document.getElementById('project').value;
      const jql = document.getElementById('jql').value.trim();
      const btn = document.getElementById('executeBtn');

      if (!jsessionid || !xsrftoken) {
        log('Please fill in JSESSIONID and XSRF_TOKEN', 'error');
        return;
      }

      btn.disabled = true;
      setStatus('running', 'Running...');
      setProgress(0, 0);
      log('Starting execution for project: ' + project, 'info');

      try {
        const res = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsessionid, xsrftoken, project, jql })
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.type === 'progress') {
                setProgress(msg.current, msg.total);
              }
              if (msg.type === 'log') {
                log(msg.message, msg.level || 'info');
              }
              if (msg.type === 'done') {
                setStatus('done', 'Completed');
                log(msg.message, 'success');
              }
              if (msg.type === 'error') {
                setStatus('error', 'Error');
                log(msg.message, 'error');
              }
            } catch(e) {}
          }
        }
      } catch (err) {
        log('Connection error: ' + err.message, 'error');
        setStatus('error', 'Error');
      }
      btn.disabled = false;
    }
  </script>
</body>
</html>`;

// ============ COOKIE / SESSION HELPERS ============
// Cập nhật cookie jar (object name->value) từ mảng Set-Cookie header.
function updateJar(jar, setCookieHeaders) {
  if (!setCookieHeaders) return;
  for (const cookie of setCookieHeaders) {
    const first = cookie.split(";")[0];
    const eq = first.indexOf("=");
    if (eq > 0) {
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (value && value !== '""') jar[name] = value;
    }
  }
}

function jarToCookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// Promise-wrapper cho https.request, trả về { statusCode, headers, body }.
function httpsRequest(options, bodyData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () =>
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data })
      );
    });
    req.on("error", reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

// Đăng nhập Jira bằng username/password, trả về { JSESSIONID, XSRF_TOKEN }.
async function loginToJira(username, password) {
  const jar = {};

  // Bước 1: GET trang login để lấy cookie khởi tạo (atlassian.xsrf.token + JSESSIONID ẩn danh).
  const seed = await httpsRequest({
    hostname: JIRA_HOST,
    path: "/login.jsp",
    method: "GET",
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  updateJar(jar, seed.headers["set-cookie"]);

  // Bước 2: POST credential tới REST session API để lấy JSESSIONID đã xác thực.
  const loginBody = JSON.stringify({ username, password });
  const login = await httpsRequest(
    {
      hostname: JIRA_HOST,
      path: "/rest/auth/1/session",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(loginBody),
        Cookie: jarToCookieHeader(jar),
        "X-Atlassian-Token": "no-check",
        "X-Requested-With": "XMLHttpRequest",
        Origin: `https://${JIRA_HOST}`,
        Referer: `https://${JIRA_HOST}/login.jsp`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    },
    loginBody
  );
  updateJar(jar, login.headers["set-cookie"]);

  if (login.statusCode !== 200) {
    const reason = login.headers["x-authentication-denied-reason"];
    let msg = `Đăng nhập thất bại (HTTP ${login.statusCode})`;
    if (reason) msg += ` - ${reason}`;
    if (String(reason).includes("CAPTCHA")) {
      msg +=
        " - Jira yêu cầu nhập CAPTCHA (do sai mật khẩu nhiều lần). Hãy đăng nhập 1 lần bằng trình duyệt để xoá CAPTCHA rồi thử lại.";
    }
    throw new Error(msg + (login.body ? `: ${login.body.substring(0, 200)}` : ""));
  }

  // Bước 3: nếu chưa có xsrf token, GET 1 trang với phiên đã xác thực để server set cookie.
  if (!jar["atlassian.xsrf.token"]) {
    const page = await httpsRequest({
      hostname: JIRA_HOST,
      path: "/secure/Dashboard.jspa",
      method: "GET",
      headers: {
        Cookie: jarToCookieHeader(jar),
        "User-Agent": USER_AGENT,
        Accept: "text/html",
      },
    });
    updateJar(jar, page.headers["set-cookie"]);
  }

  const JSESSIONID = jar["JSESSIONID"];
  const XSRF_TOKEN = jar["atlassian.xsrf.token"];
  if (!JSESSIONID) throw new Error("Không lấy được JSESSIONID sau khi đăng nhập");
  if (!XSRF_TOKEN) throw new Error("Không lấy được atlassian.xsrf.token sau khi đăng nhập");
  return { JSESSIONID, XSRF_TOKEN };
}

function saveSession(data) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), "utf8");
}

function loadSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
  } catch {
    return null;
  }
}

// ============ SERVER ============
const PORT = 3456;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML_PAGE);
    return;
  }

  // Trả về session đã lưu (không gồm mật khẩu) để UI tự điền sẵn.
  if (req.method === "GET" && req.url === "/api/session") {
    const saved = loadSession();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        saved
          ? {
              jsessionid: saved.JSESSIONID,
              xsrftoken: saved.XSRF_TOKEN,
              username: saved.username || "",
              savedAt: saved.savedAt || "",
            }
          : {}
      )
    );
    return;
  }

  // Đăng nhập bằng username/password, lấy + lưu token, trả lại cho UI.
  if (req.method === "POST" && req.url === "/api/login") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      let creds;
      try {
        creds = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      const { username, password } = creds;
      if (!username || !password) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Thiếu username hoặc mật khẩu" }));
        return;
      }
      try {
        const { JSESSIONID, XSRF_TOKEN } = await loginToJira(username, password);
        const savedAt = new Date().toISOString();
        // Chỉ lưu token, KHÔNG lưu mật khẩu.
        saveSession({ JSESSIONID, XSRF_TOKEN, username, savedAt });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ ok: true, jsessionid: JSESSIONID, xsrftoken: XSRF_TOKEN, username, savedAt })
        );
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Lấy danh sách dự án người dùng có quyền truy cập (browse).
  if (req.method === "POST" && req.url === "/api/projects") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      const { jsessionid, xsrftoken } = params;
      if (!jsessionid || !xsrftoken) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Thiếu token" }));
        return;
      }
      try {
        const resp = await httpsRequest({
          hostname: JIRA_HOST,
          path: "/rest/api/2/project",
          method: "GET",
          headers: {
            Accept: "application/json",
            Cookie: `JSESSIONID=${jsessionid}; atlassian.xsrf.token=${xsrftoken}; jira.editor.user.mode=wysiwyg`,
            "User-Agent": USER_AGENT,
            "X-Requested-With": "XMLHttpRequest",
            "X-Atlassian-Token": "no-check",
          },
        });
        if (resp.statusCode !== 200) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              error: `Jira trả về HTTP ${resp.statusCode}. Token có thể đã hết hạn — hãy đăng nhập lại.`,
            })
          );
          return;
        }
        const list = JSON.parse(resp.body);
        const projects = list
          .map((p) => ({ key: p.key, name: p.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, projects }));
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/execute") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end("Invalid JSON");
        return;
      }

      const { jsessionid, xsrftoken, project, jql } = params;
      if (!jsessionid || !xsrftoken || !jql) {
        res.writeHead(400);
        res.end("Missing or invalid parameters");
        return;
      }

      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const send = (obj) => res.write(JSON.stringify(obj) + "\n");
      runLogWork(jsessionid, xsrftoken, jql, send, () => res.end());
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  // Auto-open browser
  const { exec } = require("child_process");
  exec(`start http://localhost:${PORT}`);
});

// ============ MAIN FUNCTION ============
function runLogWork(JSESSIONID, XSRF_TOKEN, jql, send, done) {
  const now = new Date();
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const START_DATE = `${String(now.getDate()).padStart(2, "0")}/${MONTHS[now.getMonth()]}/${String(now.getFullYear()).slice(-2)}`;
  const END_DATE = START_DATE;
  const TIME = ` ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  const payload = querystring.stringify({
    startIndex: 0,
    jql: jql,
    layoutKey: "list-view",
  });

  const options = {
    hostname: "jira.viettelsoftware.com",
    path: "/rest/issueNav/1/issueTable",
    method: "POST",
    headers: {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Connection: "keep-alive",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Content-Length": Buffer.byteLength(payload),
      Cookie: `JSESSIONID=${JSESSIONID}; atlassian.xsrf.token=${XSRF_TOKEN}; jira.editor.user.mode=wysiwyg`,
      Origin: "https://jira.viettelsoftware.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0",
      "X-Atlassian-Token": "no-check",
      "X-Requested-With": "XMLHttpRequest",
      __amdModuleName: "jira/issue/utils/xsrf-token-header",
    },
  };

  send({ type: "log", message: "Fetching issues from Jira...", level: "info" });

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      send({ type: "log", message: `Issue table response status: ${res.statusCode}`, level: "info" });
      try {
        const json = JSON.parse(data);
        const issueKeys = json.issueTable.issueKeys;
        send({ type: "log", message: `Found ${issueKeys.length} issues to log work`, level: "info" });
        send({ type: "progress", current: 0, total: issueKeys.length });

        let index = 0;
        function createLogWork() {
          if (index >= issueKeys.length) {
            send({ type: "done", message: `All ${issueKeys.length} log work requests completed successfully.` });
            done();
            return;
          }

          const issueKey = issueKeys[index];
          const body = JSON.stringify({
            username: USERNAME,
            issueKey: issueKey,
            timeSpend: TIME_SPEND,
            startDate: START_DATE,
            endDate: END_DATE,
            remainingTime: REMAINING_TIME,
            description: DESCRIPTION,
            time: TIME,
            period: PERIOD,
            fields: FIELDS,
          });

          const logWorkOptions = {
            hostname: "jira.viettelsoftware.com",
            path: "/rest/f-timesheet/1.0/log-work/create-log-work",
            method: "POST",
            headers: {
              Accept: "application/json, text/javascript, */*; q=0.01",
              "Accept-Language": "en-US,en;q=0.9",
              Connection: "keep-alive",
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
              Cookie: `JSESSIONID=${JSESSIONID}; atlassian.xsrf.token=${XSRF_TOKEN}; jira.editor.user.mode=wysiwyg`,
              Origin: "https://jira.viettelsoftware.com",
              Referer: `https://jira.viettelsoftware.com/browse/${issueKey}`,
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0",
              "X-Requested-With": "XMLHttpRequest",
            },
          };

          const logReq = https.request(logWorkOptions, (logRes) => {
            let logData = "";
            logRes.on("data", (chunk) => (logData += chunk));
            logRes.on("end", () => {
              index++;
              send({ type: "progress", current: index, total: issueKeys.length });
              const level = logRes.statusCode === 200 ? "success" : "error";
              send({ type: "log", message: `[${index}/${issueKeys.length}] ${issueKey} - Status: ${logRes.statusCode} - ${logData}`, level });
              createLogWork();
            });
          });

          logReq.on("error", (err) => {
            index++;
            send({ type: "log", message: `Error for ${issueKey}: ${err.message}`, level: "error" });
            createLogWork();
          });
          logReq.write(body);
          logReq.end();
        }

        createLogWork();
      } catch {
        send({ type: "error", message: `Failed to parse response: ${data.substring(0, 200)}` });
        done();
      }
    });
  });

  req.on("error", (err) => {
    send({ type: "error", message: `Request error: ${err.message}` });
    done();
  });
  req.write(payload);
  req.end();
}
