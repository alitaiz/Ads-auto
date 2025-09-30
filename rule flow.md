# Quy trình Hoạt động của Rule "SP Search Term Harvesting" (Chống Trùng lặp theo Từng Campaign & ASIN)

## 1. Mục tiêu

Tài liệu này giải thích chi tiết quy trình hoạt động được thiết kế để đáp ứng một yêu cầu cụ thể và nâng cao:

**Làm thế nào để chạy rule trên từng campaign một cách riêng lẻ, nhưng vẫn đảm bảo chỉ "thu hoạch" một search term hiệu quả cho một ASIN cụ thể một lần duy nhất, ngay cả khi search term đó được tìm thấy từ nhiều campaign khác nhau?**

Quy trình này giải quyết được vấn đề: search term "A" có thể hoạt động tốt cho `ASIN X` nhưng không tốt cho `ASIN Y`. Do đó, hệ thống phải có khả năng thu hoạch "A" cho `ASIN X` và sau đó, nếu "A" cũng hoạt động tốt cho `ASIN Y`, hệ thống sẽ thu hoạch nó một lần nữa cho `ASIN Y` mà không bị chặn bởi lần thu hoạch đầu tiên.

---

## 2. Quy trình Chi tiết từng bước

### Bước 1: Thu thập Dữ liệu Nguồn (Source Data Collection)

1.  **Xác định Phạm vi:** Engine xác định tất cả các chiến dịch nằm trong phạm vi (scope) của rule.
2.  **Lấy Dữ liệu Chi tiết:** Nó truy vấn bảng `sponsored_products_search_term_report` để lấy tất cả các bản ghi. **Quan trọng:** Mỗi bản ghi chứa `customer_search_term`, `asin` (của sản phẩm được quảng cáo), `ad_group_id`, và `campaign_id`.
3.  **Không Tổng hợp:** Dữ liệu được giữ ở dạng chi tiết, không được cộng dồn. Mỗi bản ghi đại diện cho hiệu suất của một bộ `(search_term, asin, ad_group_id, campaign_id)` duy nhất.

---

### Bước 2: Lặp và Đánh giá Từng Nguồn (Iterate and Evaluate Each Source)

Engine sẽ lặp qua **từng bản ghi riêng lẻ** đã thu thập. Với mỗi bản ghi (ví dụ: `Search Term A` từ `Campaign Y` cho `ASIN X`), nó thực hiện các kiểm tra sau:

#### A. Đánh giá Điều kiện (Condition Evaluation)

-   Engine so sánh các chỉ số hiệu suất của **chỉ bản ghi này** với các điều kiện trong rule (ví dụ: `IF orders > 1`).
-   Nếu thỏa mãn, search term này được coi là "người chiến thắng" (winner) tại nguồn này cho ASIN này, và engine chuyển sang bước kiểm tra tiếp theo.

#### B. Kiểm tra Thời gian chờ (Cooldown Check - "Bộ nhớ" theo ASIN)

Đây là cơ chế cốt lõi để chống trùng lặp trên cơ sở **per-product**.

-   Sau khi xác định một search term là "winner", engine sẽ tạo một **khóa nhận dạng duy nhất (unique identifier)** bằng cách kết hợp search term và ASIN, ví dụ: `"ghế tre nhà tắm::B0ABCD1234"`.
-   Nó truy vấn bảng `automation_action_throttle` để tìm một bản ghi có `rule_id` khớp và `entity_id` khớp với khóa nhận dạng duy nhất này.
-   **NẾU một bản ghi hợp lệ được tìm thấy:**
    -   Điều này có nghĩa là cặp `(search_term, asin)` này đã được thu hoạch bởi rule này gần đây.
    -   Engine sẽ **BỎ QUA** hành động "Thu hoạch" (sẽ không tạo campaign mới cho cặp này).
    -   Tuy nhiên, nó sẽ **TIẾP TỤC** đến bước "Phủ định" để ngăn chặn chi tiêu ở nguồn mới này.
-   **NẾU không tìm thấy bản ghi cooldown:**
    -   Đây là lần đầu tiên cặp `(search_term, asin)` này được thu hoạch.
    -   Engine sẽ tiến hành thực hiện **CẢ HAI** hành động "Thu hoạch" và "Phủ định".

---

### Bước 3: Thực thi Hành động (Execution)

1.  **Thu hoạch (Harvest) - *Có điều kiện***
    -   Chỉ được thực hiện **nếu không có bản ghi cooldown nào tồn tại cho cặp (search_term, asin)**.
    -   Hệ thống sẽ tạo một campaign mới, ví dụ `[H] - B0ABCD1234 - Ghế tre nhà tắm - EXACT`.
    -   Sau đó, nó tạo một bản ghi mới trong `automation_action_throttle` với `entity_id` là `"ghế tre nhà tắm::B0ABCD1234"` và thời gian hết hạn trong tương lai.

2.  **Phủ định (Negate) - *Gần như Luôn luôn***
    -   Chỉ cần search term đó là một "winner" (đã thỏa mãn điều kiện ở Bước 2A), hành động này sẽ được thực hiện.
    -   Engine sẽ tạo một từ khóa/mục tiêu phủ định chính xác cho search term đó trong **chính ad group nguồn** nơi nó vừa được đánh giá.

---

### 4. Ví dụ Kịch bản Thực tế

-   **Thiết lập:**
    -   Rule `Harvest Winners` áp dụng cho `Campaign X` (cho ASIN A) và `Campaign Y` (cũng cho ASIN A).
    -   Rule `Harvest Winners 2` áp dụng cho `Campaign Z` (cho ASIN B).
    -   Điều kiện cho cả hai rule: `orders > 1`.
    -   Cooldown: `90 ngày`.
-   **Kịch bản:** Search term `"bamboo bench"` hoạt động tốt cho cả ASIN A và ASIN B.

#### Ngày 1: Rule `Harvest Winners` chạy

1.  **Xử lý Campaign X:**
    -   Tìm thấy `"bamboo bench"` (cho ASIN A) có 2 orders.
    -   Kiểm tra Cooldown cho `("Harvest Winners", "bamboo bench::ASIN_A")` -> **Không tìm thấy.**
    -   **Hành động:**
        1.  Tạo campaign `[H] - ASIN_A - bamboo bench - EXACT`.
        2.  Tạo cooldown cho `("Harvest Winners", "bamboo bench::ASIN_A")`.
        3.  Phủ định `"bamboo bench"` trong ad group nguồn của Campaign X.

2.  **Xử lý Campaign Y:**
    -   Tìm thấy `"bamboo bench"` (cho ASIN A) cũng có 2 orders.
    -   Kiểm tra Cooldown cho `("Harvest Winners", "bamboo bench::ASIN_A")` -> **Tìm thấy!**
    -   **Hành động:**
        1.  Hành động "Thu hoạch" **bị bỏ qua**.
        2.  Hành động "Phủ định" **được thực hiện**. Phủ định `"bamboo bench"` trong ad group nguồn của Campaign Y.

#### Ngày 2: Rule `Harvest Winners 2` chạy

1.  **Xử lý Campaign Z:**
    -   Tìm thấy `"bamboo bench"` (cho ASIN B) có 3 orders.
    -   Kiểm tra Cooldown cho `("Harvest Winners 2", "bamboo bench::ASIN_B")` -> **Không tìm thấy** (vì ASIN khác và rule ID cũng khác).
    -   **Hành động:**
        1.  Tạo campaign `[H] - ASIN_B - bamboo bench - EXACT`.
        2.  Tạo cooldown cho `("Harvest Winners 2", "bamboo bench::ASIN_B")`.
        3.  Phủ định `"bamboo bench"` trong ad group nguồn của Campaign Z.

**Kết quả:**
-   Hai campaign thu hoạch riêng biệt được tạo ra, một cho ASIN A và một cho ASIN B.
-   Search term `"bamboo bench"` đã được phủ định ở tất cả các nguồn (Campaign X, Y, Z) nơi nó được chứng minh là hiệu quả, giúp tối ưu hóa chi tiêu một cách triệt để và chính xác theo từng sản phẩm.