# Changelog

Tất cả thay đổi đáng chú ý của **Jira Log Work Tool** được ghi lại tại file này.

Format theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Mỗi phiên làm việc chi tiết được lưu ở [reports/](reports/). File này chỉ tổng hợp version-level changes.

---

## [1.1.0] — 2026-06-11

### Added
- **Bước 3 — Date (ngày log)**: thêm ô chọn ngày (`<input type="date">`, mặc định hôm nay) cho phép log work vào ngày bất kỳ thay vì luôn là ngày hiện tại. UI gửi `workDate` (`YYYY-MM-DD`) lên `/api/execute`; backend chuyển sang định dạng Jira `dd/MMM/yy` (vd `11/Jun/26`). Rỗng/sai định dạng → tự rơi về hôm nay.

### Changed
- Đổi label các trường ở Bước 3 cho khớp dialog Log Work của Jira: "Time Spend (giờ)" → **"Worked (Giờ đã làm)"**, "Remaining (giờ)" → **"Remaining (Giờ còn lại)"**, "Field Value" → **"Type of Work"**.

---

## [1.0.0] — 2026-05-28

First stable release. Tool đã có flow hoàn chỉnh: login → quét issue theo JQL → cấu hình log work (động) → execute hàng loạt hoặc cho 1 issue cụ thể.

### Added
- Đăng nhập Jira bằng username/password (`POST /api/login`), token chỉ tồn tại trong `sessionStorage` của tab (tự clear khi đóng tab/browser).
- Auto-fetch user key (`JIRAUSER<id>`) qua `GET /rest/api/2/myself` ngay sau login → autofill ô User Key.
- Danh sách dự án động (`POST /api/projects`) đổ vào dropdown, JQL tự sinh theo project chọn.
- Endpoint `POST /api/scan-issues` quét JQL → trả về `issueKeys[]` cho UI populate dropdown Sample issue.
- Endpoint `POST /api/log-work-fields` proxy `GET /rest/f-timesheet/1.0/log-work/<issueKey>` lấy field config (Type Of Work + options) cho issue mẫu.
- Form **Log Work Settings** với 6 trường nhập tay (User Key, Time Spend giờ, Remaining giờ, Description, Field Name, Field Value) — tất cả có default sensible.
- Dropdown **Field Name** / **Field Value** populate động từ Jira (gồm ~26 option Type Of Work). Gửi `value` (vd `study-req`) đúng định dạng plugin yêu cầu.
- Endpoint `POST /api/execute` (NDJSON streaming) chấp nhận EITHER `jql` HOẶC `issueKeys[]`.
- 2 nút Execute: **"Sử dụng setting cho tất cả issue đã quét"** + **"Chỉ chạy cho <issueKey>"** (label động).
- **Progressive disclosure**: Bước 2 mở sau login, Bước 3 mở sau quét, Bước 4 mở sau khi field options nạp xong.
- **Step markers**: 4 section khoanh viền đỏ + badge tròn số 1/2/3/4 + label "Bước N" hướng dẫn user.
- **Icon mắt** (👁/🙈) toggle hiển thị password.
- Stream tiến trình log work qua NDJSON: progress bar, message log màu (info/success/error/warn).
- DNS custom resolver (`jiraLookup`) ép `jira.viettelsoftware.com` → `JIRA_IP` (override qua env `JIRA_IP`) để tránh phụ thuộc DNS hệ thống. TLS/SNI/Host header vẫn giữ domain gốc.
- Hằng số `VERSION` trong `app.js`, hiển thị badge `v1.0.0` cạnh tiêu đề UI.

### Security
- Token (JSESSIONID, atlassian.xsrf.token) **không persist xuống đĩa** — chỉ ở `sessionStorage` trong browser tab. Đóng tab/browser = clear.
- Mật khẩu chỉ tồn tại trong memory của server trong 1 request, không log, không lưu.
- Server bind `0.0.0.0:3005` — chỉ dùng trên máy cá nhân/LAN, không expose Internet.

### Removed
- Bỏ persistence server-side: hàm `saveSession`/`loadSession` và endpoint `GET /api/session` đã được gỡ. File `.jira-session.json` không còn được tạo.
- Bỏ `require("fs")`, `require("path")` (không còn dùng).

---

## Versioning policy

- **MAJOR** (X.0.0): breaking change ở API server (vd đổi shape JSON `/api/execute`) hoặc UX workflow lớn (vd đổi nguyên flow đăng nhập).
- **MINOR** (1.X.0): thêm feature, thêm endpoint, thêm field UI mà không phá tương thích.
- **PATCH** (1.0.X): bugfix, cải tiến text, fix CSS, refactor không đổi behavior.

Quy trình bump version:
1. Sửa `VERSION` trong `app.js`.
2. Thêm section mới ở đầu `CHANGELOG.md` theo format `## [X.Y.Z] — YYYY-MM-DD`.
3. Ghi rõ vào report của phiên (`reports/YYYY-MM-DD.md`).
