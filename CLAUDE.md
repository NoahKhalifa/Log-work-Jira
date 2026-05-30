# CLAUDE.md — Hướng dẫn bối cảnh dự án

> File này được AI agent (Claude Code) tự động đọc mỗi khi bắt đầu phiên làm việc trong thư mục dự án.
> **Bắt buộc đọc trước khi sửa code. Bắt buộc ghi report sau khi sửa code.**

---

## 1. Tổng quan dự án

**Tên:** Jira Log Work Tool
**Version hiện hành:** xem hằng `VERSION` ở đầu [app.js](app.js) và [CHANGELOG.md](CHANGELOG.md). Hiện tại **v1.0.0** (2026-05-28 — first stable).
**Mục đích:** Tool nội bộ giúp log work hàng loạt lên Jira Viettel Software (`jira.viettelsoftware.com`) thông qua HTTP server cục bộ + UI HTML.
**Người dùng cuối:** Nhân viên Viettel cần log work cho nhiều issue cùng lúc (assignee = currentUser, status = Done, chưa có timespent).
**Ngôn ngữ:** Node.js thuần (không framework, không `npm install`).
**Stack:** `http`, `https`, `querystring`, `dns` — chỉ dùng module built-in.

## 2. Cấu trúc thư mục

```
Logwork jira/
├── app.js                      # File chính — server + HTML inline. Có const VERSION ở đầu file.
├── update Logwork Jira.js      # Phiên bản cũ (legacy) — gọi thẳng IP 10.120.10.129, KHÔNG còn dùng làm chính.
├── CLAUDE.md                   # File này — context cho AI agent.
├── CHANGELOG.md                # Lịch sử version (Keep a Changelog format).
└── reports/                    # Report mỗi phiên làm việc của agent (xem mục 6).
```

**Quy ước:**
- `app.js` là file chính. Mọi thay đổi feature/bugfix phải ưu tiên áp dụng vào `app.js`.
- `update Logwork Jira.js` chỉ giữ lại để tham khảo lịch sử. **Không tự động sync** sang file này trừ khi user yêu cầu rõ.
- **KHÔNG còn** file `.jira-session.json` — token nay chỉ tồn tại trong `sessionStorage` của browser (xem mục 5). Nếu thấy file này tái xuất hiện, không phải app tạo.

## 3. Kiến trúc & luồng chạy

1. `node app.js` → server HTTP cục bộ ở `http://0.0.0.0:3005` (PORT/HOST có thể override qua env).
2. UI HTML (nhúng inline trong `HTML_PAGE`) gọi các endpoint:
   - `GET  /`                    → trả HTML UI.
   - `POST /api/login`           → username + password → gọi Jira lấy `JSESSIONID` + `XSRF_TOKEN` + `userKey` → trả về cho UI (KHÔNG ghi đĩa).
   - `POST /api/projects`        → list các project user có quyền browse (Jira REST `/rest/api/2/project`).
   - `POST /api/scan-issues`     → chạy JQL → trả về `issueKeys[]` (không log work).
   - `POST /api/log-work-fields` → proxy `GET /rest/f-timesheet/1.0/log-work/<issueKey>` lấy field config + options (vd Type Of Work).
   - `POST /api/execute`         → stream NDJSON tiến trình log-work. Chấp nhận EITHER `jql` HOẶC `issueKeys[]`.
3. Backend tách 2 helper: `fetchIssueKeys(JSESSIONID, XSRF, jql)` và `logWorkForIssues(JSESSIONID, XSRF, issueKeys, config, send, done)`. `/api/execute` gọi cả 2 (hoặc bỏ qua scan nếu UI đã đưa `issueKeys`).
4. Frontend progressive disclosure: Bước 1 (login) → Bước 2 (project + JQL + Quét) → Bước 3 (Settings) → Bước 4 (Execute).

**Hằng số mặc định (đầu file `app.js`):**
- `VERSION = "1.0.0"` — bump khi release theo SemVer (xem CHANGELOG.md).
- `JIRA_HOST = "jira.viettelsoftware.com"`, `JIRA_IP` env override.
- `DEFAULT_USER_KEY = "JIRAUSER14218"` — chỉ là fallback nếu UI gửi rỗng; bình thường autofetch từ `/rest/api/2/myself`.
- `DEFAULT_TIME_SPEND_HOURS = 8` (UI gửi giờ, backend `*3600` thành giây).
- `DEFAULT_FIELD_NAME = "Type Of Work"`, `DEFAULT_FIELD_VALUE = "Test"` — fallback khi UI chưa load options từ Jira.

## 4. Quy ước code (BẮT BUỘC tuân thủ)

- **Tiếng Việt trong comment:** giữ nguyên các comment tiếng Việt hiện có. Khi thêm comment mới, ưu tiên tiếng Việt nếu giải thích nghiệp vụ; tiếng Anh cho code thuần kỹ thuật.
- **Không thêm dependency:** mọi feature phải dùng module built-in của Node. Không thêm `package.json`, `npm install`.
- **Một file một mục đích:** tránh tách module trừ khi user yêu cầu — toàn bộ logic + HTML hiện đang inline trong `app.js` là chủ ý.
- **Không log secret:** không in `JSESSIONID`, `XSRF_TOKEN`, password ra console / response. Mọi log lỗi phải mask token.
- **Không persist token xuống đĩa:** token chỉ trong RAM server (lifetime của request) và `sessionStorage` của browser. Đừng `require('fs')` để ghi token.
- **HTTPS requests:** luôn dùng `lookup: jiraLookup` khi `hostname === JIRA_HOST` để tránh phụ thuộc DNS server.
- **Không sửa giao diện màu sắc** (theme Catppuccin Mocha — `#1e1e2e`, `#89b4fa`...) trừ khi user yêu cầu. Trừ ngoại lệ: `.step` viền `#f38ba8` (đỏ) là intentional để đánh dấu bước.
- **Khi bump version**: sửa const `VERSION` trong `app.js` + thêm section mới ở đầu `CHANGELOG.md` (xem mục 9).

## 5. Bảo mật & rủi ro

- **Token (JSESSIONID, atlassian.xsrf.token)** = coi như password. Hiện chỉ tồn tại trong `sessionStorage` của browser tab — tự clear khi đóng tab/browser.
- **Mật khẩu** chỉ sống trong memory của server trong 1 request `/api/login`, không log, không lưu, không trả về UI.
- Server bind `0.0.0.0:3005` → **có thể truy cập từ mạng LAN**. Không expose ra Internet.
- Không có CSRF protection trên endpoint cục bộ — chấp nhận được vì tool dùng nội bộ trên máy cá nhân.
- Khi sửa luồng auth: test lại flow login + load projects + scan + execute trước khi báo xong.

## 6. Quy trình báo cáo sau mỗi phiên (BẮT BUỘC)

Sau mỗi phiên làm việc có **thay đổi code, config, hoặc tạo/xoá file**, agent phải:

1. Tạo file report tại `reports/YYYY-MM-DD.md` (theo ngày hiện tại, múi giờ máy user).
2. Nếu trong cùng ngày đã có file → **append** thêm một block `## Phiên <HH:MM>` mới ở cuối, không ghi đè.
3. Theo đúng cấu trúc trong [reports/_TEMPLATE.md](reports/_TEMPLATE.md).
4. Sau khi ghi report, **báo lại trong câu trả lời cuối cùng** cho user theo dạng:
   > Đã ghi report: `reports/YYYY-MM-DD.md` (phiên HH:MM).

**Không cần ghi report khi:**
- Chỉ đọc / khám phá code, không thay đổi gì.
- Chỉ trả lời câu hỏi lý thuyết.
- User yêu cầu rõ "đừng tạo report" / "skip report".

**Nội dung report phải ngắn gọn nhưng đủ để phiên sau hiểu được:**
- Yêu cầu của user là gì (1–2 câu).
- Đã sửa file/hàm nào (kèm đường dẫn `file:line`).
- Quyết định kỹ thuật quan trọng + lý do.
- Việc còn dang dở / cần làm tiếp.
- Lệnh đã chạy để verify (nếu có).

## 7. Verify trước khi báo xong

- Thay đổi logic server: chạy `node app.js`, mở `http://localhost:3005`, login → load projects → execute với JQL test.
- Thay đổi UI: mở browser, kiểm tra render + thao tác cơ bản (login, đổi project, JQL auto-fill).
- Nếu **không thể tự test** (ví dụ cần password Jira thật) → ghi rõ trong report ở mục "Chưa verify".

## 8. Lệnh thường dùng

```powershell
# Chạy server
node app.js

# Chạy với port khác
$env:PORT=4000; node app.js

# Override IP Jira
$env:JIRA_IP="10.120.10.129"; node app.js
```

## 9. Versioning (BẮT BUỘC tuân thủ khi release)

Tool theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **MAJOR** (`X.0.0`): breaking change ở API server (vd đổi shape `/api/execute` payload) hoặc UX workflow lớn (vd đổi nguyên flow đăng nhập).
- **MINOR** (`1.X.0`): thêm feature/endpoint/field UI mà KHÔNG phá tương thích — user upgrade không cần đổi gì.
- **PATCH** (`1.0.X`): bugfix, fix text/CSS, refactor không đổi behavior.

**Quy trình bump (khi user yêu cầu release):**

1. Sửa hằng `VERSION` ở đầu [app.js](app.js).
2. Thêm section mới ở đầu [CHANGELOG.md](CHANGELOG.md) theo format:
   ```
   ## [X.Y.Z] — YYYY-MM-DD

   ### Added / Changed / Fixed / Removed / Security
   - ...
   ```
3. Ghi vào report của phiên (mục 6) là đã bump version từ A → B.
4. KHÔNG bump version cho mỗi commit nhỏ — chỉ bump khi user xác nhận "release" hoặc tới mốc đáng kể.
