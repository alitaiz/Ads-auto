# Ứng dụng Quản lý & Tự động hóa Amazon PPC (Tự Host)

Đây là một ứng dụng web toàn diện, được thiết kế để quản lý và tự động hóa các chiến dịch quảng cáo Amazon PPC. Nền tảng này được xây dựng để bạn có thể tự host trên máy chủ của riêng mình, mang lại toàn quyền kiểm soát dữ liệu và chi phí vận hành cực thấp.

## Các tính năng Chính

-   **Dashboard Quản lý PPC Toàn diện:**
    -   Xem và quản lý các chiến dịch Sponsored Products, Sponsored Brands, và Sponsored Display ở cùng một nơi.
    -   Kết hợp dữ liệu "live" từ Amazon Marketing Stream và dữ liệu lịch sử từ báo cáo để có cái nhìn đầy đủ nhất.
    -   Chỉnh sửa trạng thái, ngân sách, và giá thầu trực tiếp trên giao diện.
    -   Xem chi tiết (drill-down) từ Campaign xuống Ad Group và Keywords/Targets.

-   **Phân tích Dữ liệu Chuyên sâu:**
    -   **Search Term Report:** Phân tích hiệu suất cho Sponsored Products, Sponsored Brands, và Sponsored Display. Xác định các cơ hội và những từ khóa/cibles lãng phí.
    -   **Sales & Traffic Report:** Xem dữ liệu kinh doanh tổng thể, bao gồm cả doanh số organic, để đánh giá tác động thực sự của quảng cáo.

-   **Trung tâm Tự động hóa (Automation Center):**
    -   **Điều chỉnh Bid (Bid Adjustment):** Tạo các luật IF/THEN phức tạp để tự động tăng/giảm giá thầu dựa trên ACOS, ROAS, clicks, orders, và nhiều chỉ số khác.
    -   **Quản lý Search Term (Search Term Automation):** Tự động phủ định các search term không hiệu quả (dựa trên chi tiêu, số clicks không ra đơn, v.v.).
    -   **Tăng tốc Ngân sách (Budget Acceleration):** Tự động tăng ngân sách trong ngày cho các chiến dịch đang hoạt động hiệu quả để không bỏ lỡ doanh thu và tự động khôi phục vào cuối ngày.

-   **Kiến trúc Tự Host & Tiết kiệm:**
    -   Triển khai trên VPS Ubuntu với PostgreSQL, giúp bạn làm chủ hoàn toàn dữ liệu của mình.
    -   Sử dụng pipeline dữ liệu hybrid (AWS Lambda + VPS) để giữ chi phí AWS ở mức tối thiểu.

## Hướng dẫn Cài đặt & Triển khai

Để triển khai ứng dụng này, hãy làm theo các hướng dẫn chi tiết được cung cấp trong dự án:

1.  **Giai đoạn 1: Cài đặt Nền tảng trên VPS**
    -   Xem file: `2.PHASE_1_DEPLOYMENT_GUIDE.md`

2.  **Giai đoạn 2: Tích hợp Dữ liệu "Live" từ Amazon Marketing Stream**
    -   Xem file: `3.AMAZON_MARKETING_STREAM_GUIDE.md`

3.  **Giai đoạn 3: Tải Dữ liệu Lịch sử & Tự động hóa Hàng ngày**
    -   Xem file: `9.HISTORICAL_AND_DAILY_DATA_GUIDE.md`
    -   Để tải dữ liệu số lượng lớn, xem file: `10.HIGH_VOLUME_DATA_FETCHING_GUIDE.md`

4.  **Giai đoạn 4: Bảo mật Ứng dụng**
    -   Kích hoạt HTTPS: `6.SECURITY_SSL_CERTBOT_GUIDE.md`
    -   Thêm lớp mật khẩu: `5.SECURITY_NGINX_BASIC_AUTH_GUIDE.md`

5.  **(MỚI) Chiến lược Khởi chạy PPC cho Sản phẩm Mới**
    -   Xem file: `PPC_LAUNCH_STRATEGY.md`

## Chạy trên Máy tính Cá nhân (Local Development)

**Yêu cầu:** Node.js, PostgreSQL đang chạy trên máy của bạn.

1.  **Cài đặt dependencies:**
    ```bash
    npm install
    ```
2.  **Cấu hình biến môi trường:**
    -   Sao chép file `backend/.env.example.txt` thành `backend/.env`.
    -   Điền đầy đủ thông tin kết nối database PostgreSQL và các credentials API của Amazon.
3.  **Chạy Backend Server:**
    ```bash
    npm run server:dev
    ```
4.  **Chạy Frontend (trong một cửa sổ terminal khác):**
    ```bash
    npm run dev
    ```
5.  Mở trình duyệt và truy cập `http://localhost:5173`.