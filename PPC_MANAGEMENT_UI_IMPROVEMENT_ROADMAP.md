# Lộ trình Phát triển: Ứng dụng Quản lý & Tự động hóa Amazon PPC (Tự Host)

## Mục tiêu Chính

Xây dựng một ứng dụng web toàn diện để quản lý và tự động hóa các chiến dịch quảng cáo Amazon PPC, được triển khai trên một máy chủ riêng ảo (VPS) chạy Ubuntu 22.04, sử dụng PostgreSQL làm cơ sở dữ liệu chính.

---

## Kiến trúc Hệ thống

-   **Frontend:** React, Chart.js, giao diện người dùng tương tác.
-   **Backend:** Node.js / Express chạy trên VPS Ubuntu 22.04.
-   **Database:** PostgreSQL trên cùng VPS, lưu trữ tất cả dữ liệu báo cáo và cấu hình.
-   **Luồng Dữ liệu (Amazon Marketing Stream):** `Amazon Ads API` → `AWS Kinesis Data Firehose` → `AWS Lambda (Forwarder)` → `Backend API Endpoint (trên VPS)` → `PostgreSQL`.
-   **Luồng Quản lý (Campaign Management):** `Frontend` → `Backend API (trên VPS)` → `Amazon Ads API v3`.

---

## Lộ trình Phát triển

### Giai đoạn 1: Nền tảng & Cài đặt Ban đầu

**Mục tiêu:** Thiết lập hạ tầng cốt lõi trên VPS và xây dựng cấu trúc ứng dụng cơ bản từ đầu.

#### Nhiệm vụ Hạ tầng (VPS):
1.  **Cài đặt & Cấu hình VPS:**
    -   Provision một VPS chạy Ubuntu 22.04.
    -   Cài đặt Nginx làm reverse proxy.
    -   Cài đặt Node.js (phiên bản LTS) và một trình quản lý package (npm/yarn).
    -   Cài đặt và bảo mật PostgreSQL. Tạo database và user cho ứng dụng.
2.  **Quản lý Tiến trình & Bảo mật:**
    -   Cài đặt PM2 để quản lý và giữ cho ứng dụng backend luôn chạy.
    -   Cấu hình tường lửa (UFW) để chỉ cho phép các port cần thiết (SSH, HTTP, HTTPS).
    -   (Khuyến nghị) Cài đặt SSL miễn phí với Let's Encrypt để kích hoạt HTTPS.

#### Nhiệm vụ Dự án:
1.  **Khởi tạo Dự án:**
    -   Thiết lập cấu trúc thư mục cho `frontend` và `backend`.
    -   Khởi tạo dự án frontend React (sử dụng Vite) và backend Node.js/Express.
2.  **Kết nối & Xác thực:**
    -   Thiết lập kết nối từ backend đến database PostgreSQL.
    -   Triển khai luồng xác thực OAuth 2.0 cho Amazon Ads API & SP-API trong backend để lấy và làm mới access token một cách an toàn.
    -   Lưu trữ tất cả credentials (DB, Amazon API) trong file `.env`.
3.  **Xây dựng Giao diện Cơ bản:**
    -   Tạo layout chính cho ứng dụng (sidebar, header, khu vực nội dung chính) bằng React.
    -   Thiết lập routing cơ bản cho các trang sau này (ví dụ: Dashboard, Campaigns, Automation).

---

### Giai đoạn 2: Tích hợp Dữ liệu Thời gian thực (Amazon Marketing Stream)

**Mục tiêu:** Tích hợp Amazon Marketing Stream để nhận dữ liệu hiệu suất gần như ngay lập tức. Đây là bước nền tảng để thu thập dữ liệu cho các quyết định tự động hóa sau này.

#### Nhiệm vụ AWS:
1.  **Cấu hình Pipeline:**
    -   Tạo một Kinesis Data Firehose delivery stream.
    -   Tạo một Lambda function (`process-and-forward-stream`) với vai trò nhận dữ liệu từ Firehose và chuyển tiếp đến backend.
    -   Tạo các IAM Role cần thiết theo hướng dẫn của Amazon để cho phép Ads API ghi vào Firehose.

#### Nhiệm vụ Backend & VPS:
1.  **Tạo Endpoint Nhận Dữ liệu:**
    -   Xây dựng một API endpoint bảo mật (`POST /api/stream-ingest`) trên backend, sử dụng một API key bí mật để xác thực.
    -   Tạo bảng `raw_stream_events` trong PostgreSQL để lưu trữ dữ liệu stream thô.
2.  **Đăng ký Stream:**
    -   Cập nhật file `.env` với các ARN của Firehose và IAM roles.
    -   Chạy script để đăng ký (subscribe) các dataset cần thiết (ví dụ: `sp-traffic`, `sp-conversion`).
3.  **Tổng hợp Dữ liệu:**
    -   Tạo các cron job hoặc quy trình trong backend để tổng hợp dữ liệu từ `raw_stream_events` vào các bảng summary để truy vấn nhanh hơn.

#### Nhiệm vụ Frontend:
1.  **Hiển thị Dữ liệu "Live":**
    -   Cập nhật giao diện để lấy và hiển thị các chỉ số gần thời gian thực (impressions, clicks, spend) từ backend.
    -   Triển khai cơ chế làm mới dữ liệu tự động (ví dụ: polling mỗi 30 giây).

---

### Giai đoạn 3: Lấy Dữ liệu & Quản lý Thủ công

**Mục tiêu:** Xây dựng giao diện để xem dữ liệu đã thu thập và cho phép người dùng thực hiện các hành động quản lý thủ công. Điều này giúp kiểm tra và xác thực dữ liệu stream, đồng thời cung cấp chức năng cơ bản.

#### Nhiệm vụ Backend:

1.  **Tải Dữ liệu Lịch sử (Backfilling):**
    -   **Mục đích:** Nạp dữ liệu lịch sử vào cơ sở dữ liệu để phân tích sâu hơn và cung cấp ngữ cảnh cho các quyết định tối ưu hóa. Các script này được thiết kế để chạy một lần hoặc định kỳ (ví dụ: hàng tháng) để lấp đầy những khoảng trống dữ liệu.
    -   **Quan trọng:** Trước khi chạy các script này, bạn cần tạo các bảng tương ứng trong database PostgreSQL bằng cách chạy các file migration SQL (`003_...`, `004_...`).
    -   **Script 1: Báo cáo Hiệu suất Từ khóa (Sponsored Products Search Term Report)**
        -   Cung cấp dữ liệu chi tiết về các cụm từ tìm kiếm (search terms) của khách hàng. Đây là dữ liệu **cốt lõi** để tối ưu hóa PPC.
        -   **File:** `scripts/fetch_sp_search_term_report.js`
        -   **Cách chạy (từ thư mục gốc của dự án):**
            ```bash
            # Ví dụ: Tải dữ liệu từ ngày 1 đến ngày 31 tháng 1 năm 2024
            node scripts/fetch_sp_search_term_report.js 2024-01-01 2024-01-31
            ```
    -   **Script 2: Báo cáo Doanh số & Lưu lượng truy cập (Sales & Traffic Report)**
        -   Cung cấp cái nhìn tổng quan về hiệu suất kinh doanh, bao gồm cả doanh số tự nhiên (organic).
        -   **File:** `scripts/fetch_sales_and_traffic.js`
        -   **Cách chạy (từ thư mục gốc của dự án):**
            ```bash
            # Ví dụ: Tải dữ liệu từ ngày 1 đến ngày 7 tháng 2 năm 2024
            node scripts/fetch_sales_and_traffic.js 2024-02-01 2024-02-07
            ```

2.  **API cho Dữ liệu Trực tiếp:**
    -   Tạo các API endpoint để lấy cấu trúc chiến dịch hiện tại từ Amazon (ví dụ: `GET /api/ppc/campaigns`).
    -   Tạo các API endpoint để thực hiện các thay đổi (ví dụ: `PUT /api/ppc/keywords/:id/bid`, `PUT /api/ppc/campaigns/:id/status`).

#### Nhiệm vụ Frontend:
1.  **Xây dựng Giao diện Chiến dịch:**
    -   Tạo một trang để hiển thị bảng dữ liệu các chiến dịch lấy từ backend.
    -   Triển khai cấu trúc xem chi tiết (drill-down): click vào Campaign để xem Ad Groups, click vào Ad Group để xem Keywords/Targets.
2.  **Triển khai Chức năng Chỉnh sửa Tại chỗ (In-line Editing):**
    -   Cho phép người dùng bấm trực tiếp vào các trường như `Status`, `Budget`, `Bid` trong bảng để chỉnh sửa.
    -   Khi thay đổi, gọi đến API của backend để lưu thay đổi lên Amazon.
    -   Hiển thị thông báo thành công/thất bại.

---

### Giai đoạn 4: Xây dựng Bộ máy Tự động hóa Dựa trên Luật

**Mục tiêu:** Xây dựng tính năng tự động hóa cốt lõi, cho phép người dùng tạo các "luật" để hệ thống tự động tối ưu hóa chiến dịch.

#### Nhiệm vụ Backend:
1.  **Thiết kế Schema Database:**
    -   Tạo bảng `automation_rules` để lưu trữ các luật (`conditions`, `actions`, `frequency`, `is_active`).
    -   Tạo bảng `automation_logs` để ghi lại mọi hành động mà hệ thống đã thực hiện.
2.  **Xây dựng "Rules Engine":**
    -   Tạo một **cron job** (sử dụng `node-cron`) chạy định kỳ trên server (ví dụ: mỗi 15 phút).
    -   Script này sẽ:
        1.  Lấy tất cả các luật đang hoạt động từ `automation_rules`.
        2.  Với mỗi luật, lấy dữ liệu hiệu suất cần thiết từ PostgreSQL.
        3.  Đánh giá xem các điều kiện có được thỏa mãn không (ví dụ: `IF ACOS > 40%`).
        4.  Nếu có, thực thi hành động bằng cách gọi Ads API và ghi lại kết quả vào `automation_logs`.
3.  **Tạo API CRUD cho Rules:** Xây dựng các endpoint để frontend có thể Tạo, Đọc, Cập nhật, Xóa các luật.

#### Nhiệm vụ Frontend:
1.  **Xây dựng Giao diện "Automation Rules":**
    -   Tạo một trang mới để quản lý các luật.
    -   Thiết kế một trình tạo luật trực quan, thân thiện với người dùng.
2.  **Hiển thị Lịch sử Tự động hóa:**
    -   Tạo một giao diện để người dùng xem lại tất cả các hành động đã được hệ thống tự động thực hiện, giúp họ tin tưởng và kiểm soát quy trình.
