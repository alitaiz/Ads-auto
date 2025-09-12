# Chi tiết Quy trình Hoạt động của Rules Engine

## 1. Giới thiệu

Tài liệu này mô tả chi tiết luồng hoạt động từ đầu đến cuối của **Rules Engine**, hệ thống chịu trách nhiệm tự động hóa các hành động PPC như điều chỉnh giá thầu và quản lý từ khóa phủ định. Việc hiểu rõ quy trình này là rất quan trọng để chẩn đoán lỗi và phát triển các tính năng trong tương lai.

**Luồng hoạt động tổng quan:**

`Scheduler (Cron)` ➔ `Lấy Rules cần chạy (DB)` ➔ `Tổng hợp Dữ liệu Hiệu suất (DB)` ➔ `Làm giàu Dữ liệu & Lấy Trạng thái hiện tại (API)` ➔ `Đánh giá Logic` ➔ `Thực thi Hành động (API)` ➔ `Ghi Log (DB)`

---

## 2. Quy trình Chi tiết từng bước

### Bước 1: Lập lịch và Chọn Rule (Scheduling & Rule Selection)

-   **Kích hoạt:** Một `cron job` chạy mỗi phút một lần để kích hoạt hàm `checkAndRunDueRules`.
-   **Truy vấn Database:** Hệ thống truy vấn bảng `automation_rules` để lấy tất cả các rule có `is_active = true`.
-   **Kiểm tra Tần suất:** Với mỗi rule, hàm `isRuleDue` sẽ so sánh thời gian hiện tại với `last_run_at` và cấu hình `frequency` (ví dụ: `{"unit": "hours", "value": 1}`). Nếu đã đến lúc chạy, rule đó sẽ được đưa vào hàng đợi xử lý.

### Bước 2: Tổng hợp Dữ liệu Hiệu suất (Data Aggregation)

Đây là bước phức tạp nhất, nơi hệ thống thu thập dữ liệu từ hai nguồn khác nhau để có được bức tranh toàn cảnh.

-   **Nguồn dữ liệu Hybrid:**
    1.  **Dữ liệu Lịch sử (> 3 ngày trước):** Lấy từ bảng `sponsored_products_search_term_report`. Nguồn này ổn định nhưng có độ trễ.
    2.  **Dữ liệu Gần thời gian thực (< 3 ngày):** Lấy từ bảng `raw_stream_events` (Amazon Marketing Stream). Nguồn này nhanh nhưng dữ liệu có thể được điều chỉnh.
-   **Truy vấn SQL `UNION ALL`:** Hàm `getPerformanceData` xây dựng một câu lệnh SQL phức tạp sử dụng `UNION ALL` để kết hợp dữ liệu từ cả hai bảng trên vào một tập kết quả duy nhất.
-   **Dữ liệu được truy vấn (Tùy theo loại Rule):**
    -   **Đối với Rule `BID_ADJUSTMENT`:**
        -   `entity_id`: `keyword_id` hoặc `target_id` (nếu có).
        -   `entity_type`: `'keyword'` hoặc `'target'`.
        -   `entity_text`: `keyword_text` hoặc `targeting` (ví dụ: `close-match`).
        -   `campaign_id`, `ad_group_id`.
        -   Các chỉ số hàng ngày: `spend`, `sales`, `clicks`, `orders`.
    -   **Đối với Rule `SEARCH_TERM_AUTOMATION`:**
        -   `customer_search_term`.
        -   `campaign_id`, `ad_group_id`.
        -   Các chỉ số hàng ngày: `spend`, `sales`, `clicks`, `orders`.
-   **Kết quả:** Dữ liệu trả về là một `Map`, trong đó `key` là định danh của thực thể (ví dụ: `keyword_id` hoặc `customer_search_term`) và `value` là một object chứa thông tin và một mảng dữ liệu hiệu suất theo từng ngày.

### Bước 3: Làm giàu Dữ liệu - Lấy Target ID (Data Enrichment)

**Đây là bước quan trọng để giải quyết vấn đề cốt lõi.**

-   **Vấn đề:** Dữ liệu lịch sử từ `sponsored_products_search_term_report` **không có `target_id`** cho các mục tiêu của chiến dịch Auto/PAT.
-   **Giải pháp:**
    1.  **Phân loại:** Hệ thống phân loại các thực thể thành: từ khóa có ID, mục tiêu có ID, và **mục tiêu chưa có ID** (chỉ có `ad_group_id` và `entity_text`).
    2.  **Gọi API để làm giàu:**
        -   **API Endpoint:** `POST /sp/targets/list`
        -   **Input:** Với mỗi `ad_group_id` của các mục tiêu chưa có ID, hệ thống sẽ gọi API này.
        -   **Output:** Amazon trả về danh sách tất cả các mục tiêu (targeting clauses) *hiện có* trong Ad Group đó, bao gồm `targetId` và `expression` (ví dụ: `{"type": "CLOSE_MATCH", "value": "Close-match"}`).
    3.  **Khớp dữ liệu:** Hệ thống xây dựng một map `(ad_group_id, expression_value) -> targetId` và dùng nó để tìm `targetId` cho các mục tiêu lịch sử còn thiếu.

### Bước 4: Lấy Trạng thái Hiện tại - Giá thầu (Fetching Current State)

Trước khi có thể tính toán thay đổi, hệ thống cần biết giá thầu *hiện tại* của các thực thể.

-   **Lấy giá thầu từ khóa:**
    -   **API Endpoint:** `POST /sp/keywords/list`
    -   **Input:** Danh sách các `keywordId` đã được xác định.
    -   **Output:** Thông tin chi tiết của từng từ khóa, bao gồm `bid`.
-   **Lấy giá thầu mục tiêu:**
    -   **API Endpoint:** `POST /sp/targets/list`
    -   **Input:** Danh sách các `targetId` đã được xác định (bao gồm cả các ID vừa được làm giàu ở Bước 3).
    -   **Output:** Thông tin chi tiết của từng mục tiêu, bao gồm `bid`.

### Bước 5: Đánh giá Logic và Tính toán Hành động

-   **Nguyên tắc "First Match Wins":** Hệ thống lặp qua từng `conditionGroups` trong một rule theo thứ tự từ trên xuống dưới. Ngay khi một nhóm điều kiện được thỏa mãn, hành động của nhóm đó sẽ được thực hiện và quá trình xử lý cho thực thể đó sẽ dừng lại.
-   **Tính toán chỉ số:** Với mỗi điều kiện (ví dụ: `ACOS > 40% trong 60 ngày`), hàm `calculateMetricsForWindow` sẽ được gọi để tổng hợp dữ liệu hàng ngày đã thu thập ở Bước 2 thành một chỉ số duy nhất cho khoảng thời gian đó.
-   **Tính toán hành động:**
    -   **Điều chỉnh Bid:** Tính toán giá thầu mới dựa trên `currentBid` và `%` thay đổi. Áp dụng các giới hạn `minBid` và `maxBid` nếu có.
    -   **Phủ định Search Term:** Tạo một object chứa `campaignId`, `adGroupId`, `keywordText` (chính là search term), và `matchType`.

### Bước 6: Thực thi Hành động (API Calls)

Sau khi đã xác định tất cả các thay đổi cần thực hiện, hệ thống sẽ gom chúng lại và gửi các yêu cầu API hàng loạt (bulk requests).

-   **Cập nhật Bid Từ khóa:**
    -   **API Endpoint:** `PUT /sp/keywords`
    -   **Input:** Một mảng các object `{"keywordId": ..., "bid": ...}`.
-   **Cập nhật Bid Mục tiêu:**
    -   **API Endpoint:** `PUT /sp/targets`
    -   **Input:** Một mảng các object `{"targetId": ..., "bid": ...}`.
-   **Tạo Từ khóa Phủ định:**
    -   **API Endpoint:** `POST /sp/negativeKeywords`
    -   **Input:** Một mảng các object `{"campaignId": ..., "adGroupId": ..., "keywordText": ..., "matchType": ...}`.

### Bước 7: Ghi Log (Logging)

-   **Truy vấn Database:** Sau khi hoàn tất, hệ thống sẽ ghi lại một bản ghi vào bảng `automation_logs`.
-   **Dữ liệu được lưu:**
    -   `rule_id`: ID của rule vừa chạy.
    -   `status`: `SUCCESS`, `FAILURE`, hoặc `NO_ACTION`.
    -   `summary`: Một câu tóm tắt (ví dụ: "Điều chỉnh giá thầu cho 5 từ khóa.").
    -   `details`: Một object JSON chứa thông tin chi tiết về các thay đổi (ví dụ: `{"changes": [{"keywordId": "123", "oldBid": 1.0, "newBid": 0.9}]}`).

---
