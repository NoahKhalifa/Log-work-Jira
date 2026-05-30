# Report — YYYY-MM-DD

> Mỗi phiên làm việc có thay đổi code = một block `## Phiên HH:MM` bên dưới.
> File này là TEMPLATE — copy nội dung sang file mới `reports/YYYY-MM-DD.md` khi dùng.

---

## Phiên HH:MM

### Yêu cầu
<1–2 câu mô tả user muốn gì. Trích nguyên văn nếu ngắn.>

### Thay đổi
- `app.js:123-145` — <mô tả ngắn việc đã sửa>
- `app.js:200` — <…>
- (file mới) `reports/2026-05-28.md` — report này

### Quyết định & lý do
- <Quyết định kỹ thuật quan trọng>. Lý do: <vì sao>.
- <Phương án đã cân nhắc nhưng bỏ qua>. Lý do bỏ: <…>.

### Verify
- [x] `node app.js` khởi động OK ở port 3005
- [x] Login → load projects → execute chạy thành công với JQL test
- [ ] <việc chưa kịp test, ghi rõ>

### Việc còn dang dở / cần làm tiếp
- <Tính năng phụ chưa làm>.
- <Bug nghi ngờ nhưng chưa xác nhận>.
- (Không có) → ghi rõ "Không có" nếu phiên đã đóng gọn.

### Ghi chú cho phiên sau
<Bất kỳ context nào người tiếp theo (hoặc Claude phiên sau) cần biết để không lặp lại điều tra. Ví dụ: token Jira đã hết hạn lúc test, cần login lại trước khi chạy.>
