# Kế hoạch Triển khai: Tính năng Tự động hóa "Thu hoạch Search Term"

## 1. Tổng quan & Mục tiêu

Tài liệu này mô tả kế hoạch chi tiết để triển khai một loại Rule tự động hóa mới, có tên là **"Search Term Harvesting"** (Thu hoạch Search Term). Tính năng này cho phép hệ thống tự động xác định các cụm từ tìm kiếm (search terms) của khách hàng đang hoạt động hiệu quả và thực hiện một trong các hành động chiến lược sau:

1.  **Tạo một Campaign mới** với search term đó làm từ khóa đối sánh chính xác (Exact Match) hoặc mục tiêu sản phẩm (Product Targeting nếu search term là ASIN).
2.  **Chuyển search term đó vào một Campaign có sẵn** dưới dạng từ khóa hoặc mục tiêu mới.

**Mục tiêu chính:** Tự động hóa quy trình chuyển đổi các search term tiềm năng từ các chiến dịch khám phá (ví dụ: Auto, Broad) sang các chiến dịch hiệu suất cao (ví dụ: Exact, Product Targeting), đồng thời tự động phủ định search term đó ở chiến dịch gốc để tránh chồng chéo chi tiêu.

---

## 2. Luồng Hoạt động Chi tiết của Rules Engine

1.  **Kích hoạt:** `Cron Job` của Rules Engine chạy định kỳ.
2.  **Chọn Rule:** Hệ thống lấy các rule có `rule_type = 'SEARCH_TERM_HARVESTING'` đang hoạt động.
3.  **Lấy Dữ liệu Nguồn:**
    *   Engine sẽ **chỉ truy vấn** bảng `sponsored_products_search_term_report`.
    *   **Lý do:** Dữ liệu từ báo cáo đã được tổng hợp và phân bổ chính xác, có độ trễ 2 ngày. Đây là nguồn dữ liệu đáng tin cậy nhất để đưa ra quyết định chiến lược như tạo một chiến dịch mới, không nên dựa vào dữ liệu stream có thể bị điều chỉnh.
4.  **Đánh giá Điều kiện:**
    *   Với mỗi search term trong phạm vi của rule, hệ thống sẽ tính toán các chỉ số hiệu suất (ACOS, Orders, Clicks, v.v.) trong khoảng thời gian người dùng định nghĩa (ví dụ: 60 ngày qua).
    *   Hệ thống so sánh các chỉ số này với các điều kiện trong rule (ví dụ: `IF orders > 2 AND acos < 25%`).
5.  **Thực thi Hành động (Execution):** Nếu một search term thỏa mãn điều kiện, hệ thống sẽ thực hiện hành động đã được cấu hình.

    #### Kịch bản A: "Tạo Campaign Mới"

    Đây là một chuỗi gồm 4 lệnh gọi API:
    1.  **Tạo Campaign:** Gọi `POST /sp/campaigns` để tạo một chiến dịch mới với ngân sách (`dailyBudget`) được lấy từ cấu hình rule. Tên campaign có thể được tạo tự động, ví dụ: `[H] - [ASIN] - [Search Term] - [EXACT]`.
    2.  **Tạo Ad Group:** Gọi `POST /sp/adGroups` để tạo một ad group mới bên trong campaign vừa tạo.
    3.  **Tạo Keyword/Target:**
        *   **Nếu search term là từ khóa:** Gọi `POST /sp/keywords` để thêm search term làm từ khóa `exact` hoặc `phrase` vào ad group mới, với giá thầu (bid) được tính dựa trên CPC gốc hoặc giá trị tùy chỉnh.
        *   **Nếu search term là ASIN:** Gọi `POST /sp/targets` để tạo một mục tiêu sản phẩm (product target) nhắm vào ASIN đó.
    4.  **Phủ định ở Campaign Gốc (QUAN TRỌNG):**
        *   Để ngăn chặn việc chi tiêu cho cùng một search term ở cả hai nơi, hệ thống sẽ tự động gọi `POST /sp/negativeKeywords` (hoặc `POST /sp/negativeTargets` nếu là ASIN) để thêm search term đó dưới dạng **phủ định chính xác (negative exact)** vào ad group **gốc** nơi nó được tìm thấy.

    #### Kịch bản B: "Thêm vào Campaign Có sẵn"

    Đây là một chuỗi gồm 2 lệnh gọi API:
    1.  **Tạo Keyword/Target:**
        *   Gọi `POST /sp/keywords` hoặc `POST /sp/targets` để thêm search term vào ad group **đích** đã được người dùng chọn trong cấu hình rule.
    2.  **Phủ định ở Campaign Gốc:**
        *   Tương tự như kịch bản A, hệ thống sẽ phủ định search term ở ad group **gốc**.

6.  **Ghi Log:** Toàn bộ quá trình, bao gồm các ID của campaign/ad group/keyword mới tạo và hành động phủ định, sẽ được ghi chi tiết vào bảng `automation_logs`.

---

## 3. Thay đổi ở Backend

### 3.1. Cập nhật Database (`automation_rules` table)

-   Cột `rule_type` sẽ được phép có thêm giá trị mới: `'SEARCH_TERM_HARVESTING'`.
-   Cột `config` (JSONB) sẽ cần lưu trữ một cấu trúc mới cho loại rule này.

    **Ví dụ cấu trúc `config`:**
    ```json
    {
      "conditionGroups": [
        {
          "conditions": [
            { "metric": "orders", "timeWindow": 60, "operator": ">", "value": 2 },
            { "metric": "acos", "timeWindow": 60, "operator": "<", "value": 0.25 }
          ],
          "action": {
            "type": "CREATE_NEW_CAMPAIGN", // hoặc "ADD_TO_EXISTING_CAMPAIGN"
            "matchType": "EXACT", // hoặc "PHRASE"
            "newCampaignBudget": 20.00, // Chỉ áp dụng cho "CREATE_NEW_CAMPAIGN"
            "targetCampaignId": null, // Chỉ áp dụng cho "ADD_TO_EXISTING_CAMPAIGN"
            "targetAdGroupId": null, // Chỉ áp dụng cho "ADD_TO_EXISTING_CAMPAIGN"
            "bidOption": {
              "type": "CPC_MULTIPLIER", // hoặc "CUSTOM_BID"
              "value": 1.15 // (tăng 15%) hoặc giá trị bid tùy chỉnh
            }
          }
        }
      ],
      "frequency": { "unit": "days", "value": 1, "startTime": "03:00" },
      "cooldown": { "unit": "days", "value": 90 } // Cooldown cho mỗi search term đã được harvest
    }
    ```

### 3.2. Cập nhật Rules Engine (`/backend/services/automation/`)

-   Tạo một file evaluator mới, ví dụ `evaluateSearchTermHarvestingRule.js`, để chứa logic xử lý cho loại rule này.
-   Hàm evaluator sẽ:
    -   Triển khai logic lấy dữ liệu và đánh giá điều kiện như mô tả ở trên.
    -   Xây dựng chuỗi các lệnh gọi API cần thiết.
    -   Bao gồm logic để tính toán CPC trung bình của search term từ dữ liệu báo cáo (`spend / clicks`).
    -   Xử lý việc tạo tên campaign/ad group một cách tự động và hợp lý.

---

## 4. Thay đổi ở Frontend (`AutomationView.tsx`)

### 4.1. Thêm Loại Rule Mới

-   Trong modal tạo rule, khi người dùng chọn loại quảng cáo là "SP", thêm một lựa chọn mới trong "Rule Type" là **"Search Term Harvesting"**.

### 4.2. Cập nhật Giao diện Rule Builder

Khi người dùng chọn "Search Term Harvesting", giao diện của khối "THEN" (Hành động) sẽ thay đổi hoàn toàn để hiển thị các tùy chọn sau:

1.  **Lựa chọn Hành động (Action Type):**
    *   Radio buttons:
        *   `()` Tạo một campaign mới
        *   `()` Thêm vào một campaign có sẵn

2.  **Cấu hình cho "Tạo Campaign Mới":** (Hiển thị khi tùy chọn trên được chọn)
    *   **Ngân sách Hàng ngày:** Một ô nhập số cho `newCampaignBudget`.
    *   **Loại Đối sánh:** Dropdown để chọn `EXACT` hoặc `PHRASE` cho `matchType`.

3.  **Cấu hình cho "Thêm vào Campaign Có sẵn":** (Hiển thị khi tùy chọn trên được chọn)
    *   **Campaign Đích:** Một dropdown (có thể tìm kiếm) để người dùng chọn campaign có sẵn từ danh sách.
    *   **Ad Group Đích:** Một dropdown thứ hai, được cập nhật động sau khi chọn campaign, để chọn ad group đích.

4.  **Cấu hình Giá thầu (Bid Option):** (Hiển thị cho cả hai kịch bản)
    *   Radio buttons:
        *   `()` Dựa trên CPC của Search Term
        *   `()` Đặt giá thầu tùy chỉnh
    *   Nếu chọn "Dựa trên CPC", một ô nhập liệu sẽ xuất hiện cho phép người dùng nhập hệ số nhân (ví dụ: `1.15` để đặt giá thầu cao hơn 15% so với CPC).
    *   Nếu chọn "Đặt giá thầu tùy chỉnh", một ô nhập liệu sẽ xuất hiện để người dùng nhập giá trị bid cố định.

Giao diện cần quản lý state để hiển thị/ẩn các trường cấu hình một cách linh hoạt dựa trên lựa chọn của người dùng. Khi lưu, toàn bộ cấu hình này sẽ được đóng gói vào object `config` và gửi đến backend.
