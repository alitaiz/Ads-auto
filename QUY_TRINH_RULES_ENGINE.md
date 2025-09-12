# Chi tiết Quy trình Hoạt động của Rules Engine

## 1. Giới thiệu

Tài liệu này mô tả chi tiết luồng hoạt động từ đầu đến cuối của **Rules Engine**, hệ thống chịu trách nhiệm tự động hóa các hành động PPC như điều chỉnh giá thầu và quản lý từ khóa phủ định. Việc hiểu rõ quy trình này là rất quan trọng để chẩn đoán lỗi và phát triển các tính năng trong tương lai.

**Luồng hoạt động tổng quan:**

`Scheduler (Cron)` ➔ `Lấy Rules cần chạy (DB)` ➔ `Tổng hợp Dữ liệu Hiệu suất (DB)` ➔ `Phân loại & Lấy Trạng thái hiện tại (API)` ➔ `Đánh giá Logic` ➔ `Thực thi Hành động (API)` ➔ `Ghi Log (DB)`

---

## 2. Quy trình Chi tiết từng bước

### Bước 1: Lập lịch và Chọn Rule (Scheduling & Rule Selection)

-   **Kích hoạt:** Một `cron job` chạy mỗi phút một lần để kích hoạt hàm `checkAndRunDueRules`.
-   **Truy vấn Database:** Hệ thống truy vấn bảng `automation_rules` để lấy tất cả các rule có `is_active = true`.
-   **Kiểm tra Tần suất:** Với mỗi rule, hàm `isRuleDue` sẽ so sánh thời gian hiện tại với `last_run_at` và cấu hình `frequency` (ví dụ: `{"unit": "hours", "value": 1}`). Nếu đã đến lúc chạy, rule đó sẽ được đưa vào hàng đợi xử lý.

### Bước 2: Tổng hợp Dữ liệu Hiệu suất (Data Aggregation)

Đây là bước cốt lõi, nơi logic đã được cập nhật để xử lý hai loại rule một cách riêng biệt, đảm bảo tính chính xác của dữ liệu.

#### Đối với Rule `BID_ADJUSTMENT` (Hybrid Model - Dữ liệu hỗn hợp)
-   **Mục tiêu:** Có được bộ dữ liệu đầy đủ và mới nhất có thể, kéo dài đến tận ngày hiện tại.
-   **Nguồn dữ liệu Hybrid:**
    1.  **Dữ liệu Lịch sử (cho các ngày > 2 ngày trước):** Lấy từ bảng `sponsored_products_search_term_report`. Nguồn này ổn định nhưng có độ trễ.
    2.  **Dữ liệu Gần thời gian thực (cho 2 ngày gần nhất):** Lấy từ bảng `raw_stream_events` (Amazon Marketing Stream). Nguồn này nhanh nhưng dữ liệu có thể được điều chỉnh.
-   **Truy vấn SQL `UNION ALL`:** Hàm `getPerformanceData` xây dựng một câu lệnh SQL phức tạp sử dụng `UNION ALL` để kết hợp dữ liệu từ cả hai bảng trên vào một tập kết quả duy nhất.
-   **Ví dụ:** Nếu một rule chạy vào ngày **12 tháng 9** với lookback là **7 ngày**:
    -   Hệ thống sẽ lấy dữ liệu từ ngày **5/9 đến 10/9** từ bảng **lịch sử**.
    -   Hệ thống sẽ lấy dữ liệu từ ngày **11/9 đến 12/9** từ bảng **stream**.
    -   Kết quả là một bộ dữ liệu đầy đủ 7 ngày, từ 5/9 đến 12/9.

#### Đối với Rule `SEARCH_TERM_AUTOMATION` (Historical Model - Dữ liệu Lịch sử)
-   **Nguồn dữ liệu Độc quyền:** Tính năng này **CHỈ** sử dụng dữ liệu từ bảng `sponsored_products_search_term_report`. Nó không sử dụng dữ liệu stream.
-   **Độ trễ 2 ngày:** Dữ liệu này luôn có độ trễ 2 ngày so với ngày hiện tại. Điều này đảm bảo rằng các quyết định phủ định hoặc tạo mới từ khóa luôn dựa trên dữ liệu đã được tổng hợp đầy đủ và chính xác.
    -   **Ví dụ:** Nếu một rule chạy vào ngày **12 tháng 9** với lookback là **7 ngày**, hệ thống sẽ lấy dữ liệu từ ngày **3 tháng 9 đến ngày 10 tháng 9**.

Sự tách biệt này đảm bảo rằng các quyết định điều chỉnh bid có thể tận dụng dữ liệu mới nhất, trong khi các quyết định về search term luôn dựa trên dữ liệu đã hoàn chỉnh và chính xác.

### Bước 3: Phân loại Thực thể & Lấy Trạng thái Hiện tại (Entity Classification & Fetching Current State)

Dữ liệu được tổng hợp từ Bước 2 chứa hiệu suất của cả từ khóa (keywords) và mục tiêu (targets). Hệ thống cần biết trạng thái hiện tại (cụ thể là giá thầu) của chúng trước khi đưa ra quyết định.

-   **Phân loại:** Dựa vào cột `entity_type` ('keyword' hoặc 'target') từ dữ liệu đã tổng hợp, hệ thống sẽ chia tất cả các thực thể thành hai nhóm riêng biệt: một danh sách `keywordId` và một danh sách `targetId`.
-   **Lấy giá thầu từ khóa:**
    -   **API Endpoint:** `POST /sp/keywords/list`
    -   **Input:** Danh sách các `keywordId`.
    -   **Output:** Thông tin chi tiết của từng từ khóa, bao gồm `bid` hiện tại.
-   **Lấy giá thầu mục tiêu:**
    -   **API Endpoint:** `POST /sp/targets/list`
    -   **Input:** Danh sách các `targetId`.
    -   **Output:** Thông tin chi tiết của từng mục tiêu, bao gồm `bid` hiện tại.

**Cải tiến quan trọng:** Nhờ phân tích dữ liệu báo cáo mới nhất, chúng tôi đã xác nhận rằng cột `keyword_id` trong `sponsored_products_search_term_report` được điền cho **cả từ khóa và mục tiêu**. Điều này giúp loại bỏ hoàn toàn một bước "làm giàu dữ liệu" phức tạp trước đây, giúp quy trình trở nên nhanh hơn và đáng tin cậy hơn.

### Bước 4: Đánh giá Logic và Tính toán Hành động

-   **Nguyên tắc "First Match Wins":** Hệ thống lặp qua từng `conditionGroups` trong một rule theo thứ tự từ trên xuống dưới. Ngay khi một nhóm điều kiện được thỏa mãn, hành động của nhóm đó sẽ được thực hiện và quá trình xử lý cho thực thể đó sẽ dừng lại.
-   **Tính toán chỉ số:** Với mỗi điều kiện (ví dụ: `ACOS > 40% trong 60 ngày`), hàm `calculateMetricsForWindow` sẽ được gọi để tổng hợp dữ liệu hàng ngày đã thu thập ở Bước 2 thành một chỉ số duy nhất cho khoảng thời gian đó.
-   **Tính toán hành động:**
    -   **Điều chỉnh Bid:** Tính toán giá thầu mới dựa trên `currentBid` và `%` thay đổi. Áp dụng các giới hạn `minBid` và `maxBid` nếu có.
    -   **Phủ định Search Term:** Tạo một object chứa `campaignId`, `adGroupId`, `keywordText` (chính là search term), và `matchType`.

### Bước 5: Thực thi Hành động (API Calls)

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

### Bước 6: Ghi Log (Logging)

-   **Truy vấn Database:** Sau khi hoàn tất, hệ thống sẽ ghi lại một bản ghi vào bảng `automation_logs`.
-   **Dữ liệu được lưu:**
    -   `rule_id`: ID của rule vừa chạy.
    -   `status`: `SUCCESS`, `FAILURE`, hoặc `NO_ACTION`.
    -   `summary`: Một câu tóm tắt (ví dụ: "Điều chỉnh giá thầu cho 5 từ khóa.").
    -   `details`: Một object JSON chứa thông tin chi tiết về các thay đổi (ví dụ: `{"changes": [{"keywordId": "123", "oldBid": 1.0, "newBid": 0.9}]}`).