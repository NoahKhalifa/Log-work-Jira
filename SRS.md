# SRS — Jira Log Work Tool

> **Software Requirements Specification** (Đặc tả yêu cầu phần mềm)
> Phần mềm: **Jira Log Work Tool**
> Phiên bản phần mềm mô tả: **v1.0.0** (xem hằng `VERSION` ở đầu [app.js](app.js))
> Phiên bản tài liệu SRS: **1.0** — Cập nhật lần cuối: **2026-05-30**
>
> ⚠️ **BẮT BUỘC**: Mỗi khi sửa code làm thay đổi hành vi/chức năng/giao diện/API, phải cập nhật file này
> (xem quy tắc tại mục 6 của [CLAUDE.md](CLAUDE.md)). Mục [§8 Lịch sử thay đổi SRS](#8-lịch-sử-thay-đổi-srs) ghi lại từng lần sửa.

---

## 1. Giới thiệu

### 1.1 Mục đích
Tài liệu mô tả yêu cầu chức năng và phi chức năng của **Jira Log Work Tool** — công cụ nội bộ giúp nhân viên Viettel **log work hàng loạt** lên hệ thống Jira `jira.viettelsoftware.com`. Tài liệu là nguồn tham chiếu chung cho người phát triển, người bảo trì và AI agent khi thay đổi phần mềm.

### 1.2 Phạm vi
- **Trong phạm vi**: đăng nhập Jira bằng username/password, liệt kê project, sinh/sửa JQL, quét issue, xem chi tiết issue, tải cấu hình field log-work, cấu hình thông số log-work, thực thi log-work hàng loạt với hiển thị tiến trình realtime.
- **Ngoài phạm vi**: chỉnh sửa issue ngoài log-work, báo cáo timesheet, phân quyền, quản trị Jira, đồng bộ ngược, lưu trữ dữ liệu lâu dài.

### 1.3 Định nghĩa & viết tắt
| Thuật ngữ | Ý nghĩa |
|---|---|
| **JQL** | Jira Query Language — ngôn ngữ truy vấn issue của Jira. |
| **Issue key** | Mã issue, vd `VTSVOFFICE-13372`. |
| **Sub-task** | Issue con thuộc một issue cha (parent/feature). |
| **Log work** | Ghi nhận thời gian làm việc (timespent) cho một issue. |
| **JSESSIONID** | Cookie phiên đã xác thực của Jira. |
| **XSRF token** | `atlassian.xsrf.token` — token chống CSRF của Jira. |
| **userKey** | Khóa tài khoản Jira, vd `JIRAUSER14218`. |
| **NDJSON** | Newline-Delimited JSON — mỗi dòng là một JSON, dùng để stream tiến trình. |

### 1.4 Tài liệu liên quan
- [CLAUDE.md](CLAUDE.md) — quy ước dự án & quy trình làm việc.
- [CHANGELOG.md](CHANGELOG.md) — lịch sử version phần mềm (SemVer).
- [reports/](reports/) — báo cáo từng phiên làm việc.

---

## 2. Mô tả tổng quan

### 2.1 Bối cảnh sản phẩm
Công cụ là **server HTTP cục bộ + UI HTML nhúng inline**, viết bằng **Node.js thuần** (chỉ module built-in: `http`, `https`, `querystring`, `dns`), **không dependency**, **không `npm install`**. Toàn bộ logic backend và frontend nằm trong một file [app.js](app.js).

### 2.2 Kiến trúc & luồng chạy
1. `node app.js` → server lắng nghe `http://0.0.0.0:3005` (override qua env `PORT`/`HOST`).
2. Trình duyệt mở UI → thao tác qua các endpoint nội bộ (mục §4.2).
3. Server đóng vai **proxy** giữa UI và REST API của Jira (mục §4.3), thêm cookie/headers cần thiết.
4. UI theo **progressive disclosure** 4 bước: Đăng nhập → Chọn project & quét → Settings → Thực thi.

```
Browser (UI) ──HTTP──> app.js (localhost:3005) ──HTTPS──> Jira (jira.viettelsoftware.com)
   sessionStorage          RAM (per-request)                 10.120.10.129 (JIRA_IP)
```

### 2.3 Đối tượng người dùng
Nhân viên Viettel cần log-work cho nhiều sub-task cùng lúc (điển hình: assignee = bản thân, status = Done, chưa có timespent, trong tháng hiện tại).

### 2.4 Môi trường vận hành
- **Server**: máy có Node.js (≥ 18), nằm trong mạng Viettel (truy cập được Jira). Có thể là máy cá nhân hoặc server LAN nội bộ.
- **Client**: trình duyệt hiện đại (hỗ trợ `fetch`, `ReadableStream`, `sessionStorage`).
- **Mạng**: chỉ chạy trong mạng nội bộ — **KHÔNG expose ra Internet**.

### 2.5 Ràng buộc thiết kế (bắt buộc)
- C-1: Chỉ dùng module built-in của Node, không thêm dependency / `package.json`.
- C-2: Một file `app.js` chứa toàn bộ logic + HTML (chủ ý, không tách module trừ khi có yêu cầu).
- C-3: **Không persist token/secret xuống đĩa**. Token chỉ ở `sessionStorage` (browser) và RAM server trong vòng đời 1 request.
- C-4: Không log secret (JSESSIONID, XSRF, password) ra console/response.
- C-5: Khi `hostname === JIRA_HOST` phải dùng resolver `jiraLookup` để ép về `JIRA_IP`, không phụ thuộc DNS server.
- C-6: Theme **Catppuccin Mocha**; không đổi màu trừ khi có yêu cầu (ngoại lệ viền đỏ `.step`).
- C-7: Versioning theo **SemVer**; bump `VERSION` + ghi `CHANGELOG.md` khi release.

### 2.6 Giả định & phụ thuộc
- A-1: Jira giữ nguyên các REST endpoint ở §4.3.
- A-2: Tài khoản người dùng có quyền browse project và log-work.
- A-3: Server tới được Jira qua HTTPS (cổng 443).
- A-4: **Bẫy đã biết của Jira Server này** (phải tuân thủ khi gọi API):
  - `POST /rest/api/2/search`: trường `validateQuery` phải là Boolean (hoặc bỏ hẳn); **bắt buộc** header `Origin`, nếu thiếu sẽ trả `403 "XSRF check failed"`.
  - Request GET không bị kiểm tra XSRF.

---

## 3. Yêu cầu chức năng (FR)

> Quy ước mức độ: **(M)** bắt buộc, **(S)** nên có.

### FR-1 — Đăng nhập Jira (M)
- Người dùng nhập **username + password**; bấm "Đăng nhập & Lưu token".
- Server (`loginToJira`) thực hiện: GET `/login.jsp` lấy cookie seed → POST `/rest/auth/1/session` lấy `JSESSIONID` đã xác thực → (nếu cần) GET `/secure/Dashboard.jspa` để có `atlassian.xsrf.token` → GET `/rest/api/2/myself` lấy `userKey` (không bắt buộc thành công).
- Trả về UI: `jsessionid`, `xsrftoken`, `username`, `userKey`, `savedAt`. **Password không bao giờ rời RAM server, không log, không trả về.**
- Lỗi xác thực phải hiển thị nguyên nhân; nếu Jira yêu cầu CAPTCHA (do sai mật khẩu nhiều lần) phải hướng dẫn đăng nhập bằng trình duyệt để xóa CAPTCHA.
- UI lưu token vào `sessionStorage` (key `jira_session_v1`), tự điền lại khi mở cùng tab; đóng tab/browser → mất token.

### FR-2 — Tải danh sách project (M)
- Sau đăng nhập, UI gọi `/api/projects` → server gọi `GET /rest/api/2/project`.
- Trả về danh sách `{key, name}` đã **sắp xếp theo tên**; đổ vào dropdown. Có nút "Tải lại".
- Token hết hạn (Jira ≠ 200) phải báo "đăng nhập lại".

### FR-3 — Sinh & sửa JQL (M)
- Chọn project → tự sinh JQL mặc định gồm: `project = "<KEY>" AND assignee = currentUser() AND issuetype in subTaskIssueTypes() AND status = Done AND "End date" >= startOfMonth() AND "End date" <= endOfMonth() AND timespent is EMPTY ORDER BY cf[10108] DESC, priority DESC, updated DESC`.
- Ô JQL **vẫn cho phép sửa tự do** sau khi sinh.

### FR-4 — Quét issue theo JQL (M)
- Bấm "Quét issue theo JQL" → `/api/scan-issues` → server `fetchIssueKeys` gọi `POST /rest/issueNav/1/issueTable` → trả mảng `issueKeys[]` (không log work).
- Đồng thời server gọi `fetchSummaries` (`POST /rest/api/2/search`, fields=summary) trả map `summaries{key→summary}` (**best-effort**: lỗi thì trả `{}`, không phá luồng quét).
- Kết quả: đổ dropdown "Sample issue key", cập nhật trạng thái số issue tìm được, mở Bước 3 & 4 nếu có ≥1 issue.

### FR-5 — Hiển thị summary & chi tiết issue (S)
- Dropdown "Sample issue key" hiển thị dạng **`KEY — summary`** (value vẫn là key), có tooltip = summary.
- Khi chọn một issue → `/api/issue-detail` → server `fetchIssueDetail` gọi `GET /rest/api/2/issue/{key}` → panel hiển thị: **summary, type, status, priority, assignee, parent (key + tên), time tracking (estimate/đã log/còn lại), due date**.
- Text từ Jira phải được **escape** trước khi render (chống HTML injection).

### FR-6 — Tải cấu hình field log-work (M)
- `/api/log-work-fields` → server gọi `GET /rest/f-timesheet/1.0/log-work/{key}` → trả `fields[]` gồm `{id, fieldName, fieldType, required, options[{text,value}]}`.
- UI cache cấu hình; populate dropdown **Field Value** theo **Field Name** đang chọn.
- **Field Name ẩn mặc định** (vì thường chỉ 1 option, vd "Type Of Work"); **tự hiện lại** nếu Jira trả về >1 field.

### FR-7 — Cấu hình thông số log-work (M)
- Người dùng nhập/chọn: **User Key** (tự điền sau login), **Time Spend (giờ)** (mặc định 8, bắt buộc > 0), **Remaining (giờ)** (mặc định 0), **Description** (tùy chọn), **Field Value**.
- Backend quy đổi giờ → giây (`*3600`); thiếu giá trị thì rơi về `DEFAULT_*`.

### FR-8 — Thực thi log-work (M)
- Hai chế độ: **"Sử dụng setting cho tất cả issue đã quét"** (gửi toàn bộ `issueKeys`) và **"Chỉ chạy cho issue đang chọn"** (1 key).
- `/api/execute` nhận **EITHER** `jql` **HOẶC** `issueKeys[]`. Với mỗi issue, server `logWorkForIssues` gọi `POST /rest/f-timesheet/1.0/log-work/create-log-work`.
- Server **stream NDJSON** các bản tin: `{type:"progress",current,total}`, `{type:"log",message,level}`, `{type:"done",message}`, `{type:"error",message}`.
- UI cập nhật **thanh tiến trình** + **log màu** (info/success/warn/error) realtime; thành công/thất bại từng issue hiển thị theo HTTP status trả về.
- `startDate`/`endDate`/`time` lấy theo **thời điểm hiện tại của server** (định dạng `dd/MMM/yy`).

### FR-9 — Quản lý token phía client (M)
- Token chỉ ở `sessionStorage`; có ô nhập tay (JSESSIONID/XSRF) ẩn trong `<details>` để dán thủ công khi cần.
- Mọi endpoint cần token phải **validate** đủ `jsessionid` + `xsrftoken` trước khi gọi Jira, thiếu thì trả `400`.

---

## 4. Giao diện ngoài

### 4.1 Giao diện người dùng (UI)
- Trang đơn (SPA tối giản), HTML nhúng trong `HTML_PAGE`, theme **Catppuccin Mocha** (`#1e1e2e`, `#89b4fa`...).
- 4 khối "step" có viền đỏ + badge số; các bước 3–4 ẩn cho tới khi quét có kết quả.
- Thành phần: ô username/password (có nút hiện/ẩn mật khẩu), dropdown project/JQL, nút quét, dropdown sample issue + panel chi tiết, form settings, 2 nút execute, thanh tiến trình, vùng message log.

### 4.2 Giao diện API server nội bộ
| Method | Path | Input (JSON) | Output |
|---|---|---|---|
| GET | `/`, `/index.html` | — | HTML UI |
| POST | `/api/login` | `{username, password}` | `{ok, jsessionid, xsrftoken, username, userKey, savedAt}` hoặc `{ok:false, error}` |
| POST | `/api/projects` | `{jsessionid, xsrftoken}` | `{ok, projects:[{key,name}]}` |
| POST | `/api/scan-issues` | `{jsessionid, xsrftoken, jql}` | `{ok, issueKeys[], summaries{}}` |
| POST | `/api/issue-detail` | `{jsessionid, xsrftoken, issueKey}` | `{ok, detail:{key,summary,issuetype,status,assignee,priority,parent,timetracking,created,updated,duedate}}` |
| POST | `/api/log-work-fields` | `{jsessionid, xsrftoken, issueKey}` | `{ok, fields:[{id,fieldName,fieldType,required,options[]}]}` |
| POST | `/api/execute` | `{jsessionid, xsrftoken, jql?|issueKeys[]?, userKey, timeSpendHours, remainingHours, description, fieldId, fieldName, fieldValue[]}` | **NDJSON stream**: `progress`/`log`/`done`/`error` |
| * | (khác) | — | `404 Not found` |

Quy ước lỗi: thiếu tham số → `400`; lỗi gọi Jira → `200` với `{ok:false, error}` (riêng `/api/execute` trả bản tin `error` trong stream).

### 4.3 Giao diện tích hợp Jira (REST gọi từ server)
| Mục đích | Method | Endpoint Jira | Ghi chú |
|---|---|---|---|
| Seed cookie | GET | `/login.jsp` | Lấy cookie khởi tạo |
| Đăng nhập | POST | `/rest/auth/1/session` | Lấy JSESSIONID xác thực |
| Lấy XSRF | GET | `/secure/Dashboard.jspa` | Khi chưa có xsrf token |
| User key | GET | `/rest/api/2/myself` | Lấy `key` (best-effort) |
| Project | GET | `/rest/api/2/project` | Danh sách project |
| Quét key | POST | `/rest/issueNav/1/issueTable` | Trả `issueKeys[]` |
| Summary | POST | `/rest/api/2/search` | fields=summary; **cần header `Origin`**, không gửi `validateQuery` dạng string |
| Chi tiết | GET | `/rest/api/2/issue/{key}` | fields=summary,issuetype,status,assignee,priority,parent,timetracking,... |
| Field config | GET | `/rest/f-timesheet/1.0/log-work/{key}` | Lấy field + options |
| Log work | POST | `/rest/f-timesheet/1.0/log-work/create-log-work` | Tạo log-work cho từng issue |

---

## 5. Yêu cầu phi chức năng (NFR)

### 5.1 Bảo mật
- NFR-SEC-1: Password chỉ tồn tại trong RAM server trong 1 request `/api/login`; không log, không lưu, không trả về UI.
- NFR-SEC-2: Token (JSESSIONID, XSRF) coi như password — chỉ ở `sessionStorage` browser; không ghi đĩa server.
- NFR-SEC-3: Mọi log lỗi phải mask secret.
- NFR-SEC-4: Không expose server ra Internet; chấp nhận không có CSRF protection trên endpoint cục bộ.
- NFR-SEC-5: Text từ Jira hiển thị trên UI phải được escape (chống XSS/HTML injection).

### 5.2 Hiệu năng
- NFR-PERF-1: Log-work xử lý **tuần tự** từng issue (tránh quá tải Jira), stream tiến trình realtime.
- NFR-PERF-2: `fetchSummaries` đặt `maxResults = số issue` để lấy đủ summary cho mọi kích thước thực tế.

### 5.3 Khả dụng & tương thích
- NFR-USE-1: Lỗi mạng/token phải hiển thị thông điệp rõ ràng, không làm treo UI.
- NFR-USE-2: Hoạt động trên trình duyệt hỗ trợ `fetch` + streaming + `sessionStorage`.

### 5.4 Bảo trì
- NFR-MNT-1: Comment nghiệp vụ ưu tiên tiếng Việt; code thuần kỹ thuật có thể tiếng Anh.
- NFR-MNT-2: Helper backend thuần (`updateJar`, `jarToCookieHeader`, `jiraLookup`, `fetchSummaries`, `fetchIssueDetail`...) được export để unit test (`node --test`, xem [test/](test/)).
- NFR-MNT-3: `server.listen` chỉ chạy khi `require.main === module` để không mở port khi import vào test.

### 5.5 Triển khai
- NFR-DEP-1: Chạy `node app.js` (mặc định `0.0.0.0:3005`). Server LAN: copy `app.js` lên host nội bộ, chạy nền (`nohup`/systemd), mở firewall cổng 3005.
- NFR-DEP-2: Không cần build/cài dependency.

---

## 6. Truy vết yêu cầu ↔ code (tham khảo)
| FR | Vị trí chính trong [app.js](app.js) |
|---|---|
| FR-1 | `loginToJira`, route `/api/login`, UI `login()` |
| FR-2 | route `/api/projects`, UI `loadProjects()` |
| FR-3 | UI `buildJql()`, `updateJql()` |
| FR-4 | `fetchIssueKeys`, `fetchSummaries`, route `/api/scan-issues`, UI `scanIssues()` |
| FR-5 | `fetchIssueDetail`, route `/api/issue-detail`, UI `loadIssueDetail()`/`renderIssueDetail()` |
| FR-6 | route `/api/log-work-fields`, UI `applyFieldConfig()`/`onFieldNameChange()` |
| FR-7 | chuẩn hóa tham số trong route `/api/execute` |
| FR-8 | `logWorkForIssues`, route `/api/execute`, UI `runExecute()`/`executeAll()`/`executeOne()` |
| FR-9 | UI `saveSessionToStorage()`/`readSessionFromStorage()`, validate token ở các route |

---

## 7. Vấn đề mở / hướng mở rộng
- Tự khởi động lại sau reboot khi chạy server LAN (systemd service) — chưa làm.
- Xem lịch sử worklog của issue (`/rest/f-timesheet/1.0/view-issue-worklogs/get-list`) — chưa tích hợp (JQL đã lọc `timespent is EMPTY` nên ít giá trị).

---

## 8. Lịch sử thay đổi SRS
| Ngày | SRS ver | Phần mềm ver | Thay đổi |
|---|---|---|---|
| 2026-05-30 | 1.0 | 1.0.0 | Tạo SRS lần đầu. Bao gồm các tính năng: summary trong dropdown, panel chi tiết issue (`/api/issue-detail`), ẩn Field Name. |
