# Hướng dẫn Xóa "Bộ nhớ" Tự động hóa (Cooldown/Throttle)

## 1. Giới thiệu

Tài liệu này hướng dẫn chi tiết cách xóa các bản ghi trong "bộ nhớ" chống trùng lặp của Rules Engine. Cơ chế này được thiết kế để ngăn hệ thống thực hiện cùng một hành động (ví dụ: thu hoạch cùng một search term) nhiều lần trong một khoảng thời gian nhất định (gọi là "cooldown").

**Tại sao bạn cần xóa bộ nhớ này?**
-   **Để gỡ lỗi (Debugging):** Bạn muốn chạy lại một rule ngay lập tức với cùng một bộ dữ liệu để kiểm tra logic mà không bị cơ chế cooldown chặn lại.
-   **Để "Hoàn tác" một Hành động:** Bạn đã xóa các campaign được tạo tự động và muốn hệ thống có thể tạo lại chúng trong lần chạy rule tiếp theo.

> **CẢNH BÁO:** Đây là một thao tác nâng cao và can thiệp trực tiếp vào cơ sở dữ liệu. Hãy thực hiện một cách cẩn thận. Luôn ưu tiên xóa các mục cụ thể thay vì xóa toàn bộ bảng.

---

## 2. "Bộ nhớ" được lưu ở đâu?

Tất cả các hành động đã được thực hiện và đang trong thời gian "cooldown" được lưu trong bảng `automation_action_throttle` của database PostgreSQL.

Mỗi bản ghi trong bảng này chứa:
-   `rule_id`: ID của rule đã thực hiện hành động.
-   `entity_id`: Một chuỗi định danh duy nhất cho đối tượng đã bị tác động. Đối với rule "Search Term Harvesting", nó có định dạng `search_term::ASIN`.
-   `throttle_until`: Mốc thời gian mà hành động có thể được thực hiện lại.

---

## 3. Quy trình Xóa Bộ nhớ

### Bước 1: Kết nối vào Database

1.  **Đăng nhập vào VPS của bạn qua SSH:**
    ```bash
    ssh yourusername@your_vps_ip
    ```

2.  **Chuyển sang người dùng `postgres`:**
    ```bash
    sudo -i -u postgres
    ```

3.  **Kết nối vào database của ứng dụng:**
    ```bash
    psql -d amazon_data_analyzer
    ```
    Dấu nhắc lệnh của bạn sẽ đổi thành `amazon_data_analyzer=#`.

### Bước 2: Các Tùy chọn Xóa

Hãy chọn một trong các tùy chọn dưới đây, từ an toàn nhất đến mạnh nhất.

#### Tùy chọn A (An toàn nhất): Xóa các mục cụ thể

Cách này cho phép bạn xóa bộ nhớ cho một hoặc nhiều cặp `(search_term, ASIN)` cụ thể của một rule nhất định.

1.  **Tìm `rule_id`:** Vào giao diện ứng dụng, vào trang **Automation**, tìm rule của bạn. `rule_id` thường được hiển thị ở đâu đó (nếu không, bạn có thể tìm trong bảng `automation_rules`).

2.  **Xác định `entity_id`:** Ghép `search_term` và `ASIN` của bạn lại với nhau bằng dấu `::`.
    -   Ví dụ: `pet urns::B0CKSDH5H2`

3.  **Chạy lệnh DELETE:**
    -   Thay `[ID_của_rule]` bằng ID bạn tìm được.
    -   Thay các giá trị trong `IN (...)` bằng các `entity_id` bạn muốn xóa.

    ```sql
    DELETE FROM automation_action_throttle
    WHERE
        rule_id = [ID_của_rule]
        AND entity_id IN ('pet urns::B0CKSDH5H2', 'lost pet gift dog suncatcher::B0CKSDH5H2');
    ```

#### Tùy chọn B (Nâng cao): Xóa toàn bộ bộ nhớ cho một Rule

Cách này sẽ xóa tất cả các bản ghi cooldown của **chỉ một rule duy nhất**.

1.  **Tìm `rule_id`** như ở Tùy chọn A.

2.  **Chạy lệnh DELETE:**
    ```sql
    DELETE FROM automation_action_throttle WHERE rule_id = [ID_của_rule];
    ```

#### Tùy chọn C (Vùng Nguy hiểm): Xóa TOÀN BỘ bộ nhớ

Cách này sẽ xóa **tất cả** các bản ghi cooldown của **tất cả** các rule. Hệ thống sẽ "quên" mọi hành động nó đã làm. Chỉ sử dụng khi bạn muốn reset hoàn toàn.

```sql
TRUNCATE TABLE automation_action_throttle;
```

### Bước 3: Kiểm tra lại (Tùy chọn)

Sau khi chạy lệnh xóa, bạn có thể kiểm tra xem bảng đã trống chưa.

```sql
SELECT COUNT(*) FROM automation_action_throttle;
```
Kết quả mong đợi là `0` nếu bạn đã dùng Tùy chọn C, hoặc một con số nhỏ hơn nếu bạn dùng A hoặc B.

### Bước 4: Thoát

1.  Thoát khỏi `psql`:
    ```
    \q
    ```
2.  Trở về người dùng bình thường của bạn:
    ```
    exit
    ```

**Hoàn tất!** "Bộ nhớ" của hệ thống đã được xóa. Lần chạy rule tiếp theo sẽ có thể thực hiện lại các hành động trên các đối tượng mà bạn vừa "mở khóa".
