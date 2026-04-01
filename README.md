# Vi Nho Finance (HTML Version)

Dự án đã được chuyển lại sang **HTML/CSS/JS thuần**, bỏ toàn bộ React theo yêu cầu.

## Chạy dự án
```bash
npm install
npm run build:css
npm run dev
```

Truy cập:
- `http://localhost:5173/src/pages/homepage.html`

## Cấu hình `.env`
Tạo `.env` từ `.env.example`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (hoặc `VITE_SUPABASE_PUBLISHABLE_KEY`)
- `VITE_GEMINI_API_KEY`
- `VITE_GEMINI_MODEL` (tuỳ chọn, mặc định `gemini-2.5-flash`)
- `SUPABASE_SERVICE_ROLE_KEY` - cần cho `/api/auth/register` để tạo tài khoản đã xác thực ngay, không gửi mail xác nhận

## Cấu trúc hiện tại
```text
src/pages/
  homepage.html
  login-register.html
  dashboard.html
  multi_jar_budget_system.html
  reports_and_analytics.html
  setting.html
  admin.html

src/js/
  layout.js            # Header/footer dùng chung cho site pages
  supabase-client.js   # Supabase client cho HTML pages
  auth-page.js         # Logic đăng nhập/đăng ký
  dashboard-page.js    # Tải dữ liệu dashboard
  admin-page.js        # Tải dữ liệu tổng quan admin
```

## Ghi chú
- `index.html` tự chuyển hướng về `src/pages/homepage.html`.
- Backend API nội bộ và migration Supabase vẫn giữ nguyên để dùng dữ liệu thật realtime.
