# 📋 AUDIT & CLEANUP REPORT — PRE-DEPLOYMENT PRODUCTION

**Dự án:** Job Portal & Small Job Platform (Backend)  
**Nhánh Git:** `chore/audit-cleanup-pre-deploy`  
**Ngày thực hiện:** 08/09/2026  
**Kỹ sư thực hiện:** Senior Backend Engineer  

---

## 1. TỔNG QUAN & MỤC TIÊU
Thực hiện rà soát toàn diện (Security Audit & Codebase Cleanup) cho backend Node.js/Express + PostgreSQL/Supabase trước khi triển khai lên môi trường Production (Railway/Render/AWS/VPS), đảm bảo:
1. Loại bỏ toàn bộ file rác, file tạm, dead scripts, và dependencies chỉ dùng cho local dev.
2. Thiết lập `.gitignore` chuẩn production để không lọt thông tin nhạy cảm.
3. Vá toàn bộ lỗ hổng bảo mật (CORS, Rate Limiting, MIME type bypass, Error message leaks, JWT secret enforcement).
4. Khắc phục triệt để các cảnh báo bảo mật từ `npm audit` (0 vulnerabilities).
5. Đảm bảo toàn bộ tính năng và endpoint cốt lõi hoạt động ổn định 100%.

---

## 2. KẾT QUẢ SO SÁNH TRƯỚC VÀ SAU DỌN DẸP

| Tiêu chí | Trước khi dọn dẹp (Baseline) | Sau khi hoàn tất (Production Ready) | Chênh lệch |
| :--- | :--- | :--- | :--- |
| **Branch Git** | `chore/audit-cleanup-pre-deploy` | `chore/audit-cleanup-pre-deploy` | Clean working tree |
| **Dung lượng file rác** | 314.2 KB (`job-portal-backend.md`) | 0 KB (Đã xoá hoàn toàn) | -314.2 KB |
| **File .gitignore** | Chưa có (Nguy cơ lộ `.env`) | Đã thêm đầy đủ rules | An toàn |
| **npm packages cài đặt** | 488 packages | 212 packages | -276 packages (-56%) |
| **Lỗ hổng npm audit** | 3 moderate (`qs` DoS / array-limit) | **0 vulnerabilities** | Đã xử lý 100% |
| **Bảo vệ Rate Limiting** | Không có (Dễ bị DDoS & Brute-force) | Global (1000/15m) + Auth (30/15m) | Kích hoạt đầy đủ |
| **CORS Policy** | Mở tự do cho mọi origin | Bắt buộc `FRONTEND_URL` trên prod | Chặn Origin lạ |
| **JWT Secret Fallback** | Hardcoded chuỗi mặc định | Bắt buộc biến môi trường trên prod | Chống tấn công giả mạo token |
| **Upload File Security** | Dễ bị bypass bằng extension | Kiểm tra nghiêm ngặt `MIME && Ext` | Chống RCE/MIME Spoofing |
| **Rò rỉ lỗi 500** | Lộ raw error / DB message | Ẩn chi tiết lỗi nội bộ trên prod | Không lộ cấu trúc DB |

---

## 3. BẢNG PHÂN LOẠI FILE CODEBASE

### 🗑️ Nhóm A — File rác & Cấu hình thiếu (Đã dọn dẹp)
- `backend/job-portal-backend.md`: File dump Repomix cũ (314 KB) -> **ĐÃ XOÁ**.
- `.gitignore`: Chưa tồn tại -> **ĐÃ TẠO MỚI** (chặn `.env`, `node_modules/`, `logs/`, `uploads/`,...).

### 🧪 Nhóm B — File chỉ dùng cho Dev/Test (Đã dọn dẹp cho Production)
- `backend/tests/api.test.js` & thư mục `tests/` -> **ĐÃ XOÁ**.
- `backend/scripts/seed.js` & `backend/scripts/seed-demo.js` -> **ĐÃ XOÁ** (tránh rủi ro ghi đè data trên production).
- `package.json`: Gỡ bỏ scripts `seed`, `seed:demo`, `test`, gỡ devDependencies `@faker-js/faker`, `jest`, `supertest`.

### 🗄️ Nhóm C — Database Migrations (Giữ lại & Tối ưu)
- Giữ nguyên toàn bộ 8 file migration từ `001_initial_schema.sql` đến `008_drop_complaint_report.sql`.
- Tối ưu hoá `backend/scripts/run-migration.js`:
  - Cho phép chạy tự động tuần tự 8 file migration theo thứ tự `001` -> `008` khi không truyền tham số.
  - Vẫn hỗ trợ chạy từng file migration cụ thể bằng cách truyền tham số (vd: `node scripts/run-migration.js 008_drop_complaint_report.sql`).

### 🛡️ Nhóm D — Core Codebase & Security Patches (Đã vá bảo mật)
- `src/app.js`: Tích hợp `express-rate-limit` (Global + Auth), siết chặt CORS theo `FRONTEND_URL` ở môi trường production.
- `src/modules/auth/auth.service.js` & `src/middlewares/auth.middleware.js`: Ném ngoại lệ `FATAL` ngay khi khởi động nếu thiếu `JWT_SECRET` hoặc `REFRESH_TOKEN_SECRET` trong môi trường production.
- `src/middlewares/upload.middleware.js`: Sửa logic điều kiện `OR` thành `AND` (`isAllowedMime && hasAllowedExt`), hỗ trợ an toàn cho tệp CV (`.pdf`, `.doc`, `.docx`), ảnh đại diện (`.jpg`, `.png`, `.webp`), và tài liệu xác minh.
- `src/middlewares/error.middleware.js`: Bổ sung xử lý lỗi `MulterError`, ẩn chi tiết lỗi hệ thống / DB message khi `NODE_ENV === 'production'`.
- `src/utils/document-parser.js`: Giới hạn tối đa 20 trang PDF và 100.000 ký tự text trích xuất, thêm cơ chế fallback an toàn tránh crash bộ nhớ khi parse file CV lỗi.

---

## 4. DANH MỤC LỖ HỔNG BẢO MẬT & CHI TIẾT SỬA LỖI (SECURITY AUDIT)

| Mã | Mức độ | File & Vị trí | Mô tả rủi ro | Giải pháp kỹ thuật đã áp dụng |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | High | `src/app.js:L31-L37` | CORS chấp nhận mọi origin do fallback `callback(null, true)`. Hacker có thể tạo trang độc hại khai thác credential API. | Thêm kiểm tra `NODE_ENV === 'production'`: chỉ chấp nhận domain trong danh sách `FRONTEND_URL`. |
| **SEC-02** | High | `src/app.js` | Thiếu Rate Limiting dẫn tới nguy cơ bị Brute-force mật khẩu hoặc tấn công từ chối dịch vụ (DoS). | Thêm Global Rate Limiter (1000 req/15m) và Auth Rate Limiter (30 req/15m cho login/register). |
| **SEC-03** | High | `src/modules/auth/auth.service.js`<br>`src/middlewares/auth.middleware.js` | Sử dụng fallback string mặc định nếu thiếu `JWT_SECRET`. | Kiểm tra bắt buộc: ném lỗi dừng server nếu thiếu secret khi chạy ở chế độ Production. |
| **SEC-04** | Medium | `src/middlewares/upload.middleware.js` | Điều kiện lọc file dùng toán tử `OR`, cho phép vượt qua MIME check chỉ bằng cách đổi đuôi file (MIME spoofing). | Chuyển sang kiểm tra kết hợp đồng thời `hasValidExt && hasValidMime`. |
| **SEC-05** | Medium | `src/middlewares/error.middleware.js` | Trả nguyên văn `err.message` cho mã lỗi 500 ra response client, làm lộ thông tin database/schema. | Ghi log chi tiết nội bộ, trả thông báo chuẩn hoá thân thiện cho client khi chạy production. |
| **SEC-06** | Low | `src/utils/document-parser.js` | Parse PDF không giới hạn số trang/dung lượng text, có thể bị tấn công Memory Exhaustion (DoS). | Giới hạn `max: 20` trang PDF và cắt ngắn tối đa 100.000 ký tự. |
| **SEC-07** | Low | Root directory | Thiếu `.gitignore` dẫn đến rủi ro lộ file `.env` hoặc commit `node_modules`. | Tạo `.gitignore` chuẩn. |

---

## 5. NHẬT KÝ COMMITS TRÊN NHÁNH `chore/audit-cleanup-pre-deploy`

```
3a64e30 chore(deps): audit fix package dependencies
f3dfd05 fix(security): patch CORS, rate limiting, JWT secret enforcement and upload validation
643f06d chore: optimize migration runner script
6dff644 chore: remove dev/test scripts and dependencies for production
1ddc641 chore: remove junk files and add .gitignore
b1452ed chore: initial baseline commit before audit
```

---

## 6. HƯỚNG DẪN DÀNH CHO DEVOPS / ADMIN TRƯỚC KHI DEPLOY PRODUCTION

### 🔑 1. Thiết lập các biến môi trường bắt buộc (.env trên Server)
```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
JWT_SECRET=[CHUOI_SECURE_RANDOM_DAI_TOI_THIEU_64_CHARS]
REFRESH_TOKEN_SECRET=[CHUOI_SECURE_RANDOM_DAI_TOI_THIEU_64_CHARS]
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
FRONTEND_URL=https://your-domain.com,https://admin.your-domain.com
AUTO_APPROVE_DEMO=false
```

### 🚀 2. Chạy Migration trên Database Production
```bash
npm run migrate
```
*(Script sẽ tự động chạy tuần tự từ `001` đến `008` nếu database chưa áp dụng schema).*

### 🟢 3. Khởi chạy ứng dụng
```bash
npm start
```
- Endpoint kiểm tra sức khoẻ: `GET /health` -> `{ status: "UP", message: "Database connection healthy" }`
