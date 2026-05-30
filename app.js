const https = require("https");
const http = require("http");
const querystring = require("querystring");
const dns = require("dns");

// ============ VERSION ============
// SemVer. Bump theo CHANGELOG.md mỗi khi release.
const VERSION = "1.0.0";

// ============ JIRA HOST / SESSION FILE ============
const JIRA_HOST = "jira.viettelsoftware.com";
// IP tĩnh của Jira để khỏi phụ thuộc DNS của server (đổi được qua biến môi trường JIRA_IP).
// Vẫn giữ hostname ở mọi request -> TLS/SNI/Host header vẫn dùng domain, chỉ DNS trỏ thẳng IP.
const JIRA_IP = process.env.JIRA_IP || "10.120.10.129";
// Resolver tuỳ biến: chỉ ép jira.viettelsoftware.com -> JIRA_IP, các host khác dùng DNS hệ thống.
function jiraLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  if (hostname === JIRA_HOST) {
    if (options && options.all) {
      return process.nextTick(() => callback(null, [{ address: JIRA_IP, family: 4 }]));
    }
    return process.nextTick(() => callback(null, JIRA_IP, 4));
  }
  return dns.lookup(hostname, options, callback);
}
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0";

// ============ LOG WORK PAYLOAD DEFAULTS ============
// Các giá trị này chỉ là mặc định nếu UI không gửi lên — tất cả đã có thể override qua form.
const DEFAULT_USER_KEY = "JIRAUSER14218";
const DEFAULT_TIME_SPEND_HOURS = 8;        // 8 giờ = 28800 giây
const DEFAULT_REMAINING_HOURS = 0;
const DEFAULT_DESCRIPTION = "";
const DEFAULT_PERIOD = false;
const DEFAULT_FIELD_NAME = "Type Of Work";
const DEFAULT_FIELD_VALUE = "Test";

// ============ HTML UI ============
const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Jira Log Work Tool</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #1e1e2e; color: #cdd6f4; padding: 24px; min-height: 100vh; }
    h1 { margin-bottom: 20px; color: #89b4fa; display: flex; align-items: center; gap: 12px; }
    .version-badge { font-size: 12px; font-weight: 600; color: #cdd6f4; background: #45475a; padding: 4px 10px; border-radius: 12px; letter-spacing: 0.4px; }
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
    .settings-box { background: #181825; border: 1px solid #45475a; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .settings-title { font-size: 14px; font-weight: 700; color: #89b4fa; margin-bottom: 12px; }
    .settings-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .settings-row .form-group { flex: 1; min-width: 140px; margin-bottom: 12px; }
    .field-hint { font-size: 11px; color: #6c7086; margin-top: 4px; }
    /* Panel chi tiết issue hiện khi chọn 1 sample issue. */
    .issue-detail { margin-top: 10px; background: #11111b; border: 1px solid #313244; border-radius: 6px; padding: 10px 12px; font-size: 12px; line-height: 1.7; }
    .issue-detail .id-title { font-weight: 700; color: #cdd6f4; font-size: 13px; margin-bottom: 4px; }
    .issue-detail .id-meta { color: #a6adc8; margin-bottom: 4px; }
    .issue-detail .id-row { color: #a6adc8; }
    .issue-detail .id-row b { color: #cdd6f4; font-weight: 600; }
    .issue-detail a { color: #89b4fa; text-decoration: none; }
    .issue-detail a:hover { text-decoration: underline; }
    /* Step marker: viền đỏ + badge số tròn ở góc trên trái, hướng dẫn người dùng làm theo thứ tự. */
    .step { position: relative; border: 2px solid #f38ba8; border-radius: 10px; padding: 18px 16px 12px; margin-bottom: 20px; }
    .step-num { position: absolute; top: -14px; left: 14px; width: 28px; height: 28px; border-radius: 50%; background: #f38ba8; color: #1e1e2e; font-weight: 800; font-size: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 3px #1e1e2e; }
    .step-label { position: absolute; top: -11px; left: 48px; background: #1e1e2e; padding: 0 8px; color: #f38ba8; font-size: 12px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; }
    /* Password field có nút mắt bên trong. */
    .password-wrap { position: relative; }
    .password-wrap input { padding-right: 40px; }
    .eye-btn { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; background: transparent; border: none; cursor: pointer; padding: 0; color: #a6adc8; font-size: 16px; margin: 0; }
    .eye-btn:hover { color: #cdd6f4; background: transparent; }
    .eye-btn:disabled { background: transparent; }
    /* Khu vực sau login: ẩn mặc định, mở khi login OK. */
    .hidden { display: none !important; }
    .exec-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
    .exec-buttons button { flex: 1; min-width: 220px; margin-top: 0; }
    .exec-buttons .btn-single { background: #f9e2af; color: #1e1e2e; }
    .exec-buttons .btn-single:hover { background: #fab387; }
    .exec-buttons .btn-single:disabled { background: #45475a; color: #6c7086; }
  </style>
</head>
<body>
  <h1>Jira Log Work Tool <span class="version-badge">v${VERSION}</span></h1>

  <!-- ===== BƯỚC 1: Đăng nhập ===== -->
  <div class="step login-box">
    <span class="step-num">1</span>
    <span class="step-label">Bước 1 — Đăng nhập</span>
    <div class="login-row">
      <div class="form-group" style="flex:1">
        <label for="username">Jira Username</label>
        <input type="text" id="username" placeholder="vd: dongnt30" autocomplete="username">
      </div>
      <div class="form-group" style="flex:1">
        <label for="password">Password</label>
        <div class="password-wrap">
          <input type="password" id="password" placeholder="Mật khẩu Jira" autocomplete="current-password">
          <button type="button" class="eye-btn" id="eyeBtn" onclick="togglePassword()" aria-label="Show password" title="Hiện/ẩn mật khẩu">👁</button>
        </div>
      </div>
    </div>
    <button id="loginBtn" onclick="login()">Đăng nhập & Lưu token</button>
    <span id="loginStatus" class="status-badge status-idle">Chưa đăng nhập</span>
    <div class="hint" id="sessionHint"></div>
  </div>

  <!-- ===== Toàn bộ phần dưới ẩn cho đến khi login thành công ===== -->
  <div id="mainContent" class="hidden">
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

    <!-- ===== BƯỚC 2: Chọn project + JQL + Quét ===== -->
    <div class="step" id="step2">
      <span class="step-num">2</span>
      <span class="step-label">Bước 2 — Chọn dự án & quét issue</span>
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
      <button type="button" id="scanBtn" onclick="scanIssues()">Quét issue theo JQL</button>
      <span id="scanStatus" class="status-badge status-idle" style="margin-left:8px;">Chưa quét</span>
      <div class="field-hint">Kết quả quét sẽ tự đổ vào "Sample issue key" ở Bước 3 và tải field options.</div>
    </div>

    <!-- ===== BƯỚC 3: Log Work Settings ===== -->
    <div class="step settings-box hidden" id="step3">
      <span class="step-num">3</span>
      <span class="step-label">Bước 3 — Log Work Settings</span>
      <div class="form-group">
        <label for="sampleIssueKey">Sample issue key (chọn từ kết quả quét)</label>
        <div style="display:flex; gap:8px; align-items:flex-end;">
          <select id="sampleIssueKey" onchange="onSampleIssueChange()" style="flex:1">
            <option value="">-- Bấm "Quét issue theo JQL" ở Bước 2 --</option>
          </select>
          <button type="button" id="loadFieldsBtn" onclick="loadFieldOptions()" style="margin-top:0; white-space:nowrap;">Tải lại options</button>
        </div>
        <div class="field-hint">Đổi sample issue sẽ tự tải lại chi tiết + Field Value cho issue đó.</div>
        <div id="issueDetail" class="issue-detail hidden"></div>
      </div>
      <div class="settings-row">
        <div class="form-group">
          <label for="userKey">User Key</label>
          <input type="text" id="userKey" placeholder="vd: JIRAUSER14218">
          <div class="field-hint">Tự điền sau khi đăng nhập.</div>
        </div>
        <div class="form-group">
          <label for="timeSpendHours">Time Spend (giờ)</label>
          <input type="number" id="timeSpendHours" min="0" step="0.5" value="8">
        </div>
        <div class="form-group">
          <label for="remainingHours">Remaining (giờ)</label>
          <input type="number" id="remainingHours" min="0" step="0.5" value="0">
        </div>
      </div>
      <div class="form-group">
        <label for="description">Description</label>
        <input type="text" id="description" placeholder="(tuỳ chọn) mô tả áp cho tất cả issue">
      </div>
      <div class="settings-row">
        <!-- Field Name: ẩn mặc định (thường chỉ 1 option). Vẫn giữ trong DOM để JS điều khiển
             options cho Field Value. Tự hiện lại nếu Jira trả về >1 field (xem applyFieldConfig). -->
        <div class="form-group" id="fieldNameGroup" style="display:none;">
          <label for="fieldName">Field Name</label>
          <select id="fieldName" onchange="onFieldNameChange()">
            <option value="Type Of Work" data-field-id="1" selected>Type Of Work</option>
          </select>
        </div>
        <div class="form-group">
          <label for="fieldValue">Field Value</label>
          <select id="fieldValue">
            <option value="Test" selected>Test</option>
          </select>
        </div>
      </div>
    </div>

    <!-- ===== BƯỚC 4: Execute ===== -->
    <div class="step hidden" id="step4">
      <span class="step-num">4</span>
      <span class="step-label">Bước 4 — Thực thi</span>
      <div class="exec-buttons">
        <button type="button" id="executeAllBtn" onclick="executeAll()">Sử dụng setting cho tất cả issue đã quét</button>
        <button type="button" id="executeOneBtn" class="btn-single" onclick="executeOne()" disabled>Chỉ chạy cho issue đang chọn</button>
      </div>
      <div style="margin-top:8px;">
        <span id="statusBadge" class="status-badge status-idle">Idle</span>
      </div>

      <div class="progress-container" id="progressContainer">
        <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
        <div class="progress-text" id="progressText">0 / 0</div>
      </div>
    </div>

    <div class="log-container">
      <label>Message Log</label>
      <div class="log-area" id="logArea"></div>
    </div>
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

    // Hiện/ẩn phần body sau login.
    function setMainVisible(visible) {
      const main = document.getElementById('mainContent');
      main.classList.toggle('hidden', !visible);
    }

    // Progressive disclosure: mở dần các bước 3/4 theo tiến độ.
    function showStep(n) {
      const el = document.getElementById('step' + n);
      if (el) el.classList.remove('hidden');
    }
    function hideStepsFrom(n) {
      for (let i = n; i <= 4; i++) {
        const el = document.getElementById('step' + i);
        if (el) el.classList.add('hidden');
      }
    }

    // Toggle hiển thị password (icon mắt).
    function togglePassword() {
      const inp = document.getElementById('password');
      const btn = document.getElementById('eyeBtn');
      const showing = inp.type === 'text';
      inp.type = showing ? 'password' : 'text';
      btn.textContent = showing ? '👁' : '🙈';
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    }

    // Token chỉ tồn tại trong sessionStorage — tab/browser đóng = clear.
    const SESSION_KEY = 'jira_session_v1';
    function saveSessionToStorage(s) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
    }
    function readSessionFromStorage() {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
    function clearSessionStorage() {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    }

    // Nạp token đã lưu (sessionStorage) để autofill — chỉ tồn tại trong cùng tab này.
    function loadSavedSession() {
      const s = readSessionFromStorage();
      if (s && s.jsessionid) {
        document.getElementById('jsessionid').value = s.jsessionid;
        document.getElementById('xsrftoken').value = s.xsrftoken || '';
        if (s.username) document.getElementById('username').value = s.username;
        if (s.userKey) document.getElementById('userKey').value = s.userKey;
        setMainVisible(true);
        setLoginStatus('done', 'Đã có token (session)');
        const when = s.savedAt ? new Date(s.savedAt).toLocaleString() : '';
        document.getElementById('sessionHint').textContent =
          'Token chỉ tồn tại trong tab này' + (when ? ' (login ' + when + ')' : '') + '. Đóng tab/browser sẽ clear.';
        loadProjects();
      }
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
          if (data.userKey) document.getElementById('userKey').value = data.userKey;
          saveSessionToStorage({
            jsessionid: data.jsessionid,
            xsrftoken: data.xsrftoken,
            username: data.username,
            userKey: data.userKey,
            savedAt: data.savedAt,
          });
          setMainVisible(true);
          setLoginStatus('done', 'Đăng nhập thành công');
          const when = data.savedAt ? new Date(data.savedAt).toLocaleString() : '';
          document.getElementById('sessionHint').textContent =
            'Token chỉ tồn tại trong tab này' + (when ? ' (login ' + when + ')' : '') + '. Đóng tab/browser sẽ clear.';
          log('Đăng nhập thành công cho ' + data.username, 'success');
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

    // Cache field config sau khi load — { fields: [...] }; key = fieldName -> options[].
    let _fieldConfigCache = null;

    // Populate fieldName select theo cache. fieldValue được populate sau khi chọn fieldName.
    function applyFieldConfig(fields) {
      _fieldConfigCache = { fields };
      const nameSel = document.getElementById('fieldName');
      const prevName = nameSel.value;
      nameSel.innerHTML = '';
      fields.forEach(function (f) {
        const opt = document.createElement('option');
        opt.value = f.fieldName;
        opt.textContent = f.fieldName + (f.required ? ' *' : '');
        opt.dataset.fieldId = f.id;
        nameSel.appendChild(opt);
      });
      // Khôi phục lựa chọn cũ nếu vẫn tồn tại.
      if (prevName && fields.some(function (f) { return f.fieldName === prevName; })) {
        nameSel.value = prevName;
      }
      // Chỉ hiện selector Field Name khi có >1 field để chọn; 1 field thì ẩn cho gọn.
      const grp = document.getElementById('fieldNameGroup');
      if (grp) grp.style.display = fields.length > 1 ? '' : 'none';
      onFieldNameChange();
    }

    function onFieldNameChange() {
      const nameSel = document.getElementById('fieldName');
      const valSel = document.getElementById('fieldValue');
      const fields = _fieldConfigCache && _fieldConfigCache.fields;
      if (!fields) return;
      const current = fields.find(function (f) { return f.fieldName === nameSel.value; });
      const prevVal = valSel.value;
      valSel.innerHTML = '';
      if (!current || !current.options.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(không có option)';
        valSel.appendChild(opt);
        return;
      }
      current.options.forEach(function (o) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.text;
        valSel.appendChild(opt);
      });
      if (prevVal && current.options.some(function (o) { return o.value === prevVal; })) {
        valSel.value = prevVal;
      }
    }

    async function loadFieldOptions() {
      const jsessionid = document.getElementById('jsessionid').value.trim();
      const xsrftoken = document.getElementById('xsrftoken').value.trim();
      const issueKey = document.getElementById('sampleIssueKey').value.trim();
      const btn = document.getElementById('loadFieldsBtn');
      if (!jsessionid || !xsrftoken) {
        log('Cần đăng nhập trước khi tải options', 'warn');
        return;
      }
      if (!issueKey) {
        log('Nhập 1 sample issue key (vd VTSVOFFICE-15580) để Jira biết lấy config theo project nào', 'warn');
        return;
      }
      btn.disabled = true;
      log('Đang tải field options từ ' + issueKey + '...', 'info');
      try {
        const res = await fetch('/api/log-work-fields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsessionid, xsrftoken, issueKey })
        });
        const data = await res.json();
        if (!data.ok) {
          log('Không tải được options: ' + data.error, 'error');
          btn.disabled = false;
          return;
        }
        if (!data.fields.length) {
          log('Jira trả về 0 field cho issue này', 'warn');
          btn.disabled = false;
          return;
        }
        applyFieldConfig(data.fields);
        const summary = data.fields.map(function (f) { return f.fieldName + '(' + f.options.length + ')'; }).join(', ');
        log('Đã tải ' + data.fields.length + ' field: ' + summary, 'success');
      } catch (err) {
        log('Lỗi tải options: ' + err.message, 'error');
      }
      btn.disabled = false;
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

    // Cache list issue đã quét từ JQL — populate sampleIssueKey dropdown từ đây.
    let _scannedIssueKeys = [];
    // Map { ISSUEKEY: "summary" } đi kèm để hiển thị "KEY — summary" trong dropdown.
    let _scannedSummaries = {};

    // Quét JQL → đổ kết quả vào dropdown sampleIssueKey + auto tải field options cho issue đầu.
    async function scanIssues() {
      const jsessionid = document.getElementById('jsessionid').value.trim();
      const xsrftoken = document.getElementById('xsrftoken').value.trim();
      const jql = document.getElementById('jql').value.trim();
      const btn = document.getElementById('scanBtn');
      const statusEl = document.getElementById('scanStatus');
      if (!jsessionid || !xsrftoken) {
        log('Cần đăng nhập trước khi quét', 'warn');
        return;
      }
      if (!jql) {
        log('JQL đang trống', 'warn');
        return;
      }
      btn.disabled = true;
      statusEl.className = 'status-badge status-running';
      statusEl.textContent = 'Đang quét...';
      log('Đang quét issue theo JQL...', 'info');
      try {
        const res = await fetch('/api/scan-issues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsessionid, xsrftoken, jql })
        });
        const data = await res.json();
        if (!data.ok) {
          log('Quét thất bại: ' + data.error, 'error');
          statusEl.className = 'status-badge status-error';
          statusEl.textContent = 'Lỗi';
          btn.disabled = false;
          return;
        }
        _scannedIssueKeys = data.issueKeys || [];
        _scannedSummaries = data.summaries || {};
        populateSampleIssueDropdown(_scannedIssueKeys);
        statusEl.className = 'status-badge status-done';
        statusEl.textContent = 'Tìm thấy ' + _scannedIssueKeys.length + ' issue';
        log('Đã quét: ' + _scannedIssueKeys.length + ' issue' + (_scannedIssueKeys.length ? ' (' + _scannedIssueKeys.slice(0, 5).join(', ') + (_scannedIssueKeys.length > 5 ? '...' : '') + ')' : ''), 'success');
        if (_scannedIssueKeys.length) {
          // Quét OK có data → mở Bước 3 (Settings).
          showStep(3);
          // Auto tải field options + chi tiết cho issue đầu tiên; sau đó mở Bước 4.
          await loadFieldOptions();
          loadIssueDetail();
          showStep(4);
        } else {
          // Không có issue → đóng các bước phía sau (giữ user ở Bước 2).
          hideStepsFrom(3);
        }
      } catch (err) {
        log('Lỗi quét: ' + err.message, 'error');
        statusEl.className = 'status-badge status-error';
        statusEl.textContent = 'Lỗi';
      }
      btn.disabled = false;
    }

    function populateSampleIssueDropdown(keys) {
      const sel = document.getElementById('sampleIssueKey');
      sel.innerHTML = '';
      if (!keys.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- Không có issue --';
        sel.appendChild(opt);
      } else {
        keys.forEach(function (k) {
          const opt = document.createElement('option');
          opt.value = k;
          const summary = _scannedSummaries[k];
          // Hiển thị "KEY — summary" để user biết đang chọn sub-task nào; value vẫn chỉ là key.
          opt.textContent = summary ? k + ' — ' + summary : k;
          if (summary) opt.title = summary;
          sel.appendChild(opt);
        });
      }
      updateExecuteOneLabel();
      updateExecuteButtonsState();
    }

    // Khi user đổi sample issue → reload options + chi tiết + cập nhật label nút "chỉ chạy cho issue này".
    async function onSampleIssueChange() {
      updateExecuteOneLabel();
      const issueKey = document.getElementById('sampleIssueKey').value;
      const box = document.getElementById('issueDetail');
      if (issueKey) {
        await loadFieldOptions();
        loadIssueDetail();
      } else if (box) {
        box.classList.add('hidden');
        box.innerHTML = '';
      }
    }

    // Escape text trước khi nhét vào innerHTML (summary có thể chứa < > & ").
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    // Gọi /api/issue-detail cho issue đang chọn → render panel chi tiết.
    async function loadIssueDetail() {
      const jsessionid = document.getElementById('jsessionid').value.trim();
      const xsrftoken = document.getElementById('xsrftoken').value.trim();
      const issueKey = document.getElementById('sampleIssueKey').value.trim();
      const box = document.getElementById('issueDetail');
      if (!box) return;
      if (!issueKey || !jsessionid || !xsrftoken) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
      }
      box.classList.remove('hidden');
      box.innerHTML = 'Đang tải chi tiết ' + esc(issueKey) + '...';
      try {
        const res = await fetch('/api/issue-detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsessionid, xsrftoken, issueKey })
        });
        const data = await res.json();
        if (!data.ok) {
          box.innerHTML = 'Không tải được chi tiết: ' + esc(data.error);
          return;
        }
        renderIssueDetail(data.detail);
      } catch (err) {
        box.innerHTML = 'Lỗi tải chi tiết: ' + esc(err.message);
      }
    }

    function renderIssueDetail(d) {
      const box = document.getElementById('issueDetail');
      const base = 'https://${JIRA_HOST}/browse/';
      const tt = d.timetracking || {};
      const rows = [];
      rows.push('<div class="id-title"><a href="' + base + encodeURIComponent(d.key) + '" target="_blank">'
        + esc(d.key) + '</a> — ' + esc(d.summary) + '</div>');
      const meta = [];
      if (d.issuetype) meta.push('<b>Type:</b> ' + esc(d.issuetype));
      if (d.status) meta.push('<b>Status:</b> ' + esc(d.status));
      if (d.priority) meta.push('<b>Priority:</b> ' + esc(d.priority));
      if (d.assignee) meta.push('<b>Assignee:</b> ' + esc(d.assignee));
      if (meta.length) rows.push('<div class="id-meta">' + meta.join(' · ') + '</div>');
      if (d.parent) {
        rows.push('<div class="id-row"><b>Parent:</b> <a href="' + base + encodeURIComponent(d.parent.key)
          + '" target="_blank">' + esc(d.parent.key) + '</a> — ' + esc(d.parent.summary) + '</div>');
      }
      const ttParts = [];
      if (tt.originalEstimate) ttParts.push('estimate ' + esc(tt.originalEstimate));
      if (tt.timeSpent) ttParts.push('đã log ' + esc(tt.timeSpent));
      if (tt.remainingEstimate) ttParts.push('còn lại ' + esc(tt.remainingEstimate));
      rows.push('<div class="id-row"><b>Time:</b> ' + (ttParts.length ? ttParts.join(' · ') : 'chưa có') + '</div>');
      if (d.duedate) rows.push('<div class="id-row"><b>Due:</b> ' + esc(d.duedate) + '</div>');
      box.innerHTML = rows.join('');
    }

    function updateExecuteOneLabel() {
      const btn = document.getElementById('executeOneBtn');
      const issueKey = document.getElementById('sampleIssueKey').value;
      btn.textContent = issueKey
        ? 'Chỉ chạy cho ' + issueKey
        : 'Chỉ chạy cho issue đang chọn';
    }

    function updateExecuteButtonsState() {
      const hasScan = _scannedIssueKeys.length > 0;
      const hasSel = !!document.getElementById('sampleIssueKey').value;
      document.getElementById('executeAllBtn').disabled = !hasScan;
      document.getElementById('executeOneBtn').disabled = !hasSel;
    }

    // Gom toàn bộ payload từ UI → gửi /api/execute với issueKeys cụ thể.
    async function runExecute(issueKeys, triggerBtn, contextLabel) {
      const jsessionid = document.getElementById('jsessionid').value.trim();
      const xsrftoken = document.getElementById('xsrftoken').value.trim();
      const jql = document.getElementById('jql').value.trim();
      const userKey = document.getElementById('userKey').value.trim();
      const timeSpendHours = parseFloat(document.getElementById('timeSpendHours').value);
      const remainingHours = parseFloat(document.getElementById('remainingHours').value);
      const description = document.getElementById('description').value;
      const fieldNameSel = document.getElementById('fieldName');
      const fieldValueSel = document.getElementById('fieldValue');
      const fieldName = fieldNameSel.value.trim();
      const fieldId = fieldNameSel.selectedOptions[0] && fieldNameSel.selectedOptions[0].dataset.fieldId
        ? parseInt(fieldNameSel.selectedOptions[0].dataset.fieldId, 10)
        : 1;
      const fieldValue = fieldValueSel.multiple
        ? Array.from(fieldValueSel.selectedOptions).map(function (o) { return o.value; })
        : (fieldValueSel.value ? [fieldValueSel.value] : []);

      if (!jsessionid || !xsrftoken) {
        log('Chưa có token — đăng nhập lại', 'error');
        return;
      }
      if (!userKey) {
        log('User Key đang trống — đăng nhập lại hoặc nhập tay', 'error');
        return;
      }
      if (!(timeSpendHours > 0)) {
        log('Time Spend phải > 0 giờ', 'error');
        return;
      }
      if (!issueKeys || !issueKeys.length) {
        log('Không có issue để chạy — quét JQL ở Bước 2 trước', 'error');
        return;
      }

      const allBtn = document.getElementById('executeAllBtn');
      const oneBtn = document.getElementById('executeOneBtn');
      allBtn.disabled = true;
      oneBtn.disabled = true;
      setStatus('running', 'Running...');
      setProgress(0, 0);
      log('Bắt đầu log work (' + contextLabel + ')', 'info');

      try {
        const res = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsessionid, xsrftoken, jql, issueKeys,
            userKey, timeSpendHours, remainingHours, description,
            fieldId, fieldName, fieldValue
          })
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
              if (msg.type === 'progress') setProgress(msg.current, msg.total);
              if (msg.type === 'log') log(msg.message, msg.level || 'info');
              if (msg.type === 'done') { setStatus('done', 'Completed'); log(msg.message, 'success'); }
              if (msg.type === 'error') { setStatus('error', 'Error'); log(msg.message, 'error'); }
            } catch(e) {}
          }
        }
      } catch (err) {
        log('Connection error: ' + err.message, 'error');
        setStatus('error', 'Error');
      }
      updateExecuteButtonsState();
    }

    function executeAll() {
      if (!_scannedIssueKeys.length) {
        log('Chưa quét — bấm "Quét issue theo JQL" ở Bước 2', 'warn');
        return;
      }
      runExecute(_scannedIssueKeys.slice(), null, 'tất cả ' + _scannedIssueKeys.length + ' issue');
    }

    function executeOne() {
      const issueKey = document.getElementById('sampleIssueKey').value;
      if (!issueKey) {
        log('Chưa chọn issue', 'warn');
        return;
      }
      runExecute([issueKey], null, 'chỉ ' + issueKey);
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
    const req = https.request({ ...options, lookup: jiraLookup }, (res) => {
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

  // Lấy user key (vd "JIRAUSER14218") để dùng cho payload log work — không bắt buộc thành công.
  let userKey = "";
  try {
    userKey = await fetchUserKey(JSESSIONID, XSRF_TOKEN);
  } catch (e) {
    // Nuốt lỗi: login vẫn coi như thành công, UI sẽ rơi về default user key.
  }
  return { JSESSIONID, XSRF_TOKEN, userKey };
}

// Gọi /rest/api/2/myself để lấy "key" của tài khoản đang đăng nhập (vd "JIRAUSER14218").
async function fetchUserKey(JSESSIONID, XSRF_TOKEN) {
  const resp = await httpsRequest({
    hostname: JIRA_HOST,
    path: "/rest/api/2/myself",
    method: "GET",
    headers: {
      Accept: "application/json",
      Cookie: `JSESSIONID=${JSESSIONID}; atlassian.xsrf.token=${XSRF_TOKEN}`,
      "User-Agent": USER_AGENT,
      "X-Requested-With": "XMLHttpRequest",
      "X-Atlassian-Token": "no-check",
    },
  });
  if (resp.statusCode !== 200) return "";
  try {
    const me = JSON.parse(resp.body);
    return me.key || "";
  } catch {
    return "";
  }
}

// Session KHÔNG còn persist xuống file. Browser tự lưu trong sessionStorage và clear khi đóng tab/browser.

// ============ SERVER ============
const PORT = process.env.PORT || 3005;
const HOST = process.env.HOST || "0.0.0.0";

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML_PAGE);
    return;
  }

  // Đăng nhập bằng username/password, trả token cho UI (UI tự lưu trong sessionStorage).
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
        const { JSESSIONID, XSRF_TOKEN, userKey } = await loginToJira(username, password);
        const savedAt = new Date().toISOString();
        // KHÔNG ghi đĩa — browser tự lưu trong sessionStorage; mật khẩu KHÔNG bao giờ rời memory.
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ ok: true, jsessionid: JSESSIONID, xsrftoken: XSRF_TOKEN, username, userKey, savedAt })
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

  // Lấy field config của 1 issue (vd Type Of Work + options). Endpoint Jira plugin trả mảng:
  //   [{ id, fieldName, fieldType, required, options: [{text, value}, ...] }, ...]
  if (req.method === "POST" && req.url === "/api/log-work-fields") {
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
      const { jsessionid, xsrftoken, issueKey } = params;
      if (!jsessionid || !xsrftoken || !issueKey) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Thiếu token hoặc issueKey" }));
        return;
      }
      try {
        const resp = await httpsRequest({
          hostname: JIRA_HOST,
          path: `/rest/f-timesheet/1.0/log-work/${encodeURIComponent(issueKey)}?_=${Date.now()}`,
          method: "GET",
          headers: {
            Accept: "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/json",
            Cookie: `JSESSIONID=${jsessionid}; atlassian.xsrf.token=${xsrftoken}; jira.editor.user.mode=wysiwyg`,
            "User-Agent": USER_AGENT,
            "X-Requested-With": "XMLHttpRequest",
            Referer: `https://${JIRA_HOST}/browse/${encodeURIComponent(issueKey)}`,
          },
        });
        if (resp.statusCode !== 200) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              error: `Jira trả về HTTP ${resp.statusCode}. Issue key có đúng không / token còn hạn không?`,
            })
          );
          return;
        }
        const parsed = JSON.parse(resp.body);
        // Chỉ lấy phần cần cho UI; giữ raw cho debug.
        const fields = Array.isArray(parsed)
          ? parsed.map((f) => ({
              id: f.id,
              fieldName: f.fieldName,
              fieldType: f.fieldType,
              required: !!f.required,
              options: Array.isArray(f.options) ? f.options.map((o) => ({ text: o.text, value: o.value })) : [],
            }))
          : [];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, fields }));
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Chi tiết 1 issue (summary, type, status, parent, time tracking...) cho panel UI.
  if (req.method === "POST" && req.url === "/api/issue-detail") {
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
      const { jsessionid, xsrftoken, issueKey } = params;
      if (!jsessionid || !xsrftoken || !issueKey) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Thiếu token hoặc issueKey" }));
        return;
      }
      try {
        const detail = await fetchIssueDetail(jsessionid, xsrftoken, issueKey);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, detail }));
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Scan: chạy JQL → trả về mảng issueKey (KHÔNG log work). UI dùng để populate dropdown.
  if (req.method === "POST" && req.url === "/api/scan-issues") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      let params;
      try { params = JSON.parse(body); }
      catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      const { jsessionid, xsrftoken, jql } = params;
      if (!jsessionid || !xsrftoken || !jql) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Thiếu token hoặc JQL" }));
        return;
      }
      try {
        const issueKeys = await fetchIssueKeys(jsessionid, xsrftoken, jql);
        // Lấy thêm summary để UI hiển thị "KEY — summary" (best-effort, lỗi thì bỏ qua).
        let summaries = {};
        try {
          summaries = await fetchSummaries(jsessionid, xsrftoken, issueKeys);
        } catch {
          summaries = {};
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, issueKeys, summaries }));
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
    req.on("end", async () => {
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end("Invalid JSON");
        return;
      }

      const { jsessionid, xsrftoken, jql } = params;
      // Cho phép EITHER jql (run cả batch) HOẶC issueKeys[] (run cụ thể 1+ issue đã chọn).
      const explicitKeys = Array.isArray(params.issueKeys) ? params.issueKeys.filter(Boolean) : [];
      if (!jsessionid || !xsrftoken || (!jql && explicitKeys.length === 0)) {
        res.writeHead(400);
        res.end("Missing or invalid parameters");
        return;
      }

      // Gom các giá trị log-work từ UI; thiếu thì rơi về DEFAULT_*.
      const userKey = (params.userKey || DEFAULT_USER_KEY).trim();
      const timeSpendHours = Number.isFinite(+params.timeSpendHours) && +params.timeSpendHours > 0
        ? +params.timeSpendHours
        : DEFAULT_TIME_SPEND_HOURS;
      const remainingHours = Number.isFinite(+params.remainingHours) && +params.remainingHours >= 0
        ? +params.remainingHours
        : DEFAULT_REMAINING_HOURS;
      const description = typeof params.description === "string" ? params.description : DEFAULT_DESCRIPTION;
      const fieldName = (params.fieldName || DEFAULT_FIELD_NAME).trim();
      const fieldId = Number.isFinite(+params.fieldId) && +params.fieldId > 0 ? +params.fieldId : 1;
      const fieldValue = Array.isArray(params.fieldValue) && params.fieldValue.length
        ? params.fieldValue
        : [DEFAULT_FIELD_VALUE];
      const fields = fieldName ? [{ id: fieldId, fieldName, fieldValue }] : [];

      const logWorkConfig = {
        userKey,
        timeSpend: Math.round(timeSpendHours * 3600),
        remainingTime: Math.round(remainingHours * 3600),
        description,
        period: DEFAULT_PERIOD,
        fields,
      };

      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const send = (obj) => res.write(JSON.stringify(obj) + "\n");

      try {
        let issueKeys;
        if (explicitKeys.length) {
          issueKeys = explicitKeys;
          send({ type: "log", message: `Running for ${issueKeys.length} explicit issue(s): ${issueKeys.join(", ")}`, level: "info" });
        } else {
          send({ type: "log", message: "Fetching issues from Jira (JQL)...", level: "info" });
          issueKeys = await fetchIssueKeys(jsessionid, xsrftoken, jql);
          send({ type: "log", message: `Found ${issueKeys.length} issues to log work`, level: "info" });
        }
        if (!issueKeys.length) {
          send({ type: "done", message: "Không có issue nào để log work." });
          res.end();
          return;
        }
        logWorkForIssues(jsessionid, xsrftoken, issueKeys, logWorkConfig, send, () => res.end());
      } catch (err) {
        send({ type: "error", message: `Request error: ${err.message}` });
        res.end();
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

// Chỉ tự động listen khi chạy trực tiếp `node app.js`.
// Khi file được require() từ test, KHÔNG mở port — test tự điều khiển server.
if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
  });
}

// ============ MAIN FUNCTIONS ============
// Gọi /rest/issueNav/1/issueTable với JQL → trả về mảng issueKey.
function fetchIssueKeys(JSESSIONID, XSRF_TOKEN, jql) {
  return new Promise((resolve, reject) => {
    const payload = querystring.stringify({ startIndex: 0, jql, layoutKey: "list-view" });
    const options = {
      hostname: JIRA_HOST,
      lookup: jiraLookup,
      path: "/rest/issueNav/1/issueTable",
      method: "POST",
      headers: {
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Connection: "keep-alive",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Content-Length": Buffer.byteLength(payload),
        Cookie: `JSESSIONID=${JSESSIONID}; atlassian.xsrf.token=${XSRF_TOKEN}; jira.editor.user.mode=wysiwyg`,
        Origin: `https://${JIRA_HOST}`,
        "User-Agent": USER_AGENT,
        "X-Atlassian-Token": "no-check",
        "X-Requested-With": "XMLHttpRequest",
        __amdModuleName: "jira/issue/utils/xsrf-token-header",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`issueTable HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
        try {
          const json = JSON.parse(data);
          resolve(json.issueTable && Array.isArray(json.issueTable.issueKeys) ? json.issueTable.issueKeys : []);
        } catch (e) {
          reject(new Error("Failed to parse issueTable response: " + data.substring(0, 200)));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// Lấy summary cho danh sách issueKey qua /rest/api/2/search (fields=summary).
// Trả về map { ISSUEKEY: "summary text" }. Best-effort: lỗi/throw -> trả {} (không phá luồng scan).
async function fetchSummaries(JSESSIONID, XSRF_TOKEN, issueKeys) {
  if (!Array.isArray(issueKeys) || !issueKeys.length) return {};
  const body = JSON.stringify({
    jql: `key in (${issueKeys.join(",")})`,
    fields: ["summary"],
    maxResults: issueKeys.length,
    // LƯU Ý: KHÔNG gửi validateQuery dạng string ("none"...) — Jira Server này parse
    // field đó thành Boolean, gửi string sẽ trả HTTP 400 (toàn bộ summary mất).
  });
  const resp = await httpsRequest(
    {
      hostname: JIRA_HOST,
      path: "/rest/api/2/search",
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Cookie: `JSESSIONID=${JSESSIONID}; atlassian.xsrf.token=${XSRF_TOKEN}; jira.editor.user.mode=wysiwyg`,
        Origin: `https://${JIRA_HOST}`, // BẮT BUỘC: thiếu Origin -> Jira trả 403 "XSRF check failed" với UA trình duyệt thật.
        "User-Agent": USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
        "X-Atlassian-Token": "no-check",
      },
    },
    body
  );
  if (resp.statusCode !== 200) return {};
  try {
    const data = JSON.parse(resp.body);
    const map = {};
    (data.issues || []).forEach((it) => {
      map[it.key] = (it.fields && it.fields.summary) || "";
    });
    return map;
  } catch {
    return {};
  }
}

// Lấy chi tiết 1 issue qua /rest/api/2/issue/{key}. Trả về object đã rút gọn cho UI
// (summary, type, status, parent, time tracking...). Throw nếu non-200 để route báo lỗi.
async function fetchIssueDetail(JSESSIONID, XSRF_TOKEN, issueKey) {
  const fieldList = "summary,issuetype,status,assignee,priority,parent,timetracking,created,updated,duedate";
  const resp = await httpsRequest({
    hostname: JIRA_HOST,
    path: `/rest/api/2/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(fieldList)}`,
    method: "GET",
    headers: {
      Accept: "application/json",
      Cookie: `JSESSIONID=${JSESSIONID}; atlassian.xsrf.token=${XSRF_TOKEN}; jira.editor.user.mode=wysiwyg`,
      "User-Agent": USER_AGENT,
      "X-Requested-With": "XMLHttpRequest",
      "X-Atlassian-Token": "no-check",
    },
  });
  if (resp.statusCode !== 200) {
    throw new Error(`Jira trả về HTTP ${resp.statusCode} khi lấy chi tiết ${issueKey}`);
  }
  const d = JSON.parse(resp.body);
  const f = d.fields || {};
  const tt = f.timetracking || {};
  return {
    key: d.key,
    summary: f.summary || "",
    issuetype: f.issuetype ? f.issuetype.name : "",
    status: f.status ? f.status.name : "",
    assignee: f.assignee ? f.assignee.displayName || f.assignee.name : "",
    priority: f.priority ? f.priority.name : "",
    parent: f.parent
      ? { key: f.parent.key, summary: (f.parent.fields && f.parent.fields.summary) || "" }
      : null,
    timetracking: {
      originalEstimate: tt.originalEstimate || "",
      remainingEstimate: tt.remainingEstimate || "",
      timeSpent: tt.timeSpent || "",
    },
    created: f.created || "",
    updated: f.updated || "",
    duedate: f.duedate || "",
  };
}

// Loop qua mảng issueKeys, gọi /create-log-work cho từng cái, stream tiến trình qua send().
function logWorkForIssues(JSESSIONID, XSRF_TOKEN, issueKeys, logWorkConfig, send, done) {
  const now = new Date();
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const START_DATE = `${String(now.getDate()).padStart(2, "0")}/${MONTHS[now.getMonth()]}/${String(now.getFullYear()).slice(-2)}`;
  const END_DATE = START_DATE;
  const TIME = ` ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

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
      username: logWorkConfig.userKey,
      issueKey: issueKey,
      timeSpend: logWorkConfig.timeSpend,
      startDate: START_DATE,
      endDate: END_DATE,
      remainingTime: logWorkConfig.remainingTime,
      description: logWorkConfig.description,
      time: TIME,
      period: logWorkConfig.period,
      fields: logWorkConfig.fields,
    });
    const logWorkOptions = {
      hostname: JIRA_HOST,
      lookup: jiraLookup,
      path: "/rest/f-timesheet/1.0/log-work/create-log-work",
      method: "POST",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        Connection: "keep-alive",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Cookie: `JSESSIONID=${JSESSIONID}; atlassian.xsrf.token=${XSRF_TOKEN}; jira.editor.user.mode=wysiwyg`,
        Origin: `https://${JIRA_HOST}`,
        Referer: `https://${JIRA_HOST}/browse/${issueKey}`,
        "User-Agent": USER_AGENT,
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
}

// ============ EXPORTS (cho unit test) ============
// Chỉ expose helper thuần + server. Không đổi behavior khi chạy `node app.js`.
module.exports = {
  VERSION,
  JIRA_HOST,
  JIRA_IP,
  jiraLookup,
  updateJar,
  jarToCookieHeader,
  httpsRequest,
  fetchIssueKeys,
  fetchSummaries,
  fetchIssueDetail,
  logWorkForIssues,
  loginToJira,
  fetchUserKey,
  server,
};
