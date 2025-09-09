# Lộ trình Cải tiến Giao diện Quản lý PPC (PPC Management UI/UX Roadmap)

## 1. Mục tiêu Chính

Tài liệu này vạch ra lộ trình chi tiết để nâng cấp giao diện "PPC Management" từ một bảng dữ liệu tổng quan thành một trung tâm quản lý chiến dịch phân cấp và đầy đủ chức năng. Mục tiêu là cho phép người dùng xem, phân tích và tối ưu hóa các chiến dịch ở mọi cấp độ (Campaign, Ad Group, Targeting) một cách trực quan và hiệu quả, trực tiếp từ trong ứng dụng.

---

## 2. Hiện trạng & Tầm nhìn

-   **Hiện trạng:** Giao diện hiện tại là một bảng phẳng, hiển thị danh sách các chiến dịch cùng với các chỉ số hiệu suất tổng hợp. Nó rất tốt cho việc theo dõi ở cấp độ cao nhưng thiếu khả năng đi sâu vào chi tiết để thực hiện các hành động tối ưu hóa cụ thể.
-   **Tầm nhìn:** Xây dựng một cấu trúc "drill-down" (xem chi tiết) mạnh mẽ. Người dùng có thể bắt đầu từ cấp độ chiến dịch, nhấp vào để xem các nhóm quảng cáo bên trong, và tiếp tục nhấp vào để quản lý các từ khóa/mục tiêu cụ thể. Tại mỗi cấp độ, họ sẽ có đầy đủ thông tin và công cụ để thực hiện các thay đổi cần thiết.

---

## 3. Lộ trình Triển khai Chi tiết

Lộ trình sẽ được chia thành các giai đoạn hợp lý để đảm bảo việc phát triển có thể kiểm soát và mang lại giá trị nhanh chóng.

### Giai đoạn 1: Nền tảng - Xem chi tiết Ad Group (Ad Group Drill-Down)

**Mục tiêu:** Cho phép người dùng nhấp vào một chiến dịch để xem danh sách các Ad Group (Nhóm quảng cáo) bên trong nó.

#### Nhiệm vụ Frontend:
1.  **Cập nhật `PPCManagementView`:**
    -   Biến cột "Campaign Name" trong bảng hiện tại thành một liên kết (link) có thể nhấp được.
    -   Khi nhấp vào, điều hướng người dùng đến một trang mới, ví dụ: `/campaigns/:campaignId/adgroups`.
2.  **Tạo View mới - `AdGroupView.tsx`:**
    -   Xây dựng một component React mới để hiển thị danh sách các Ad Group.
    -   View này sẽ hiển thị một bảng dữ liệu các Ad Group thuộc về chiến dịch đã chọn.
    -   Các cột ban đầu bao gồm: Tên Ad Group, Trạng thái (Status), Mức bid mặc định (Default Bid).
    -   Thêm "breadcrumb" (thanh điều hướng phân cấp) để người dùng dễ dàng quay lại trang danh sách chiến dịch. Ví dụ: `Campaigns > [Tên Campaign]`.

#### Nhiệm-vụ-Backend:
1.  **Tạo API Endpoint mới:**
    -   Xây dựng một endpoint `POST /api/amazon/campaigns/:campaignId/adgroups`.
    -   Endpoint này sẽ nhận `campaignId` từ URL và `profileId` từ body, sau đó gọi đến Amazon Ads API để lấy danh sách tất cả các Ad Group thuộc chiến dịch đó.
    -   Trả về dữ liệu Ad Group đã được chuẩn hóa cho frontend.

---

### Giai đoạn 2: Đi sâu - Xem chi tiết Keyword & Target

**Mục tiêu:** Từ màn hình Ad Group, cho phép người dùng xem và quản lý các Keywords (Từ khóa) hoặc Product Targeting (Mục tiêu sản phẩm) bên trong.

#### Nhiệm vụ Frontend:
1.  **Cập nhật `AdGroupView`:**
    -   Biến cột "Ad Group Name" thành một liên kết có thể nhấp được, điều hướng đến `/adgroups/:adGroupId/keywords`.
2.  **Tạo View mới - `KeywordView.tsx`:**
    -   Xây dựng một component React mới để hiển thị danh sách các từ khóa và mục tiêu.
    -   **Đây là màn hình tối ưu hóa cốt lõi.** Bảng dữ liệu sẽ bao gồm:
        -   Keyword Text / Product Target
        -   Match Type (Loại đối sánh: Broad, Phrase, Exact)
        -   Status (Trạng thái)
        -   **Bid (Giá thầu):** Trường này phải có khả năng **chỉnh sửa tại chỗ (in-line editing)**.
    -   Cập nhật breadcrumb: `Campaigns > [Tên Campaign] > [Tên Ad Group]`.

#### Nhiệm-vụ-Backend:
1.  **Tạo API Endpoint mới cho Keywords:**
    -   Xây dựng endpoint `POST /api/amazon/adgroups/:adGroupId/keywords`.
    -   Endpoint này sẽ lấy danh sách các từ khóa cho một Ad Group cụ thể.
2.  **Tạo API Endpoint để Cập nhật:**
    -   Xây dựng endpoint `PUT /api/amazon/keywords` để cho phép cập nhật hàng loạt (thay đổi trạng thái, giá thầu). Frontend sẽ gọi đến endpoint này khi người dùng chỉnh sửa giá thầu.

---

### Giai đoạn 3: Tích hợp Dữ liệu Hiệu suất Toàn diện

**Mục tiêu:** Đưa các chỉ số hiệu suất (impressions, clicks, spend, sales, ACOS, ROAS) vào tất cả các cấp độ vừa tạo.

#### Nhiệm vụ Frontend:
1.  **Cập nhật các View:**
    -   Thêm các cột chỉ số hiệu suất vào bảng trong `AdGroupView` và `KeywordView`.
    -   Hiển thị các ô "Summary Metrics" (chỉ số tổng hợp) ở đầu mỗi trang để người dùng có cái nhìn tổng quan về hiệu suất của chiến dịch/nhóm quảng cáo mà họ đang xem.

#### Nhiệm-vụ-Backend:
1.  **Mở rộng API Dữ liệu Stream:**
    -   Đây là phần phức tạp nhất. Endpoint `/api/stream/campaign-metrics` hiện tại chỉ tổng hợp dữ liệu ở cấp độ chiến dịch.
    -   Cần tạo các endpoint mới hoặc mở rộng endpoint hiện có để có thể truy vấn và tổng hợp dữ liệu từ bảng `raw_stream_events` ở các cấp độ chi tiết hơn:
        -   `GET /api/stream/adgroup-metrics`: Tổng hợp dữ liệu theo `ad_group_id`.
        -   `GET /api/stream/keyword-metrics`: Tổng hợp dữ liệu theo `keyword_id` hoặc `target_id`.
    -   Các truy vấn SQL sẽ cần `GROUP BY` theo các ID tương ứng và `SUM()` các chỉ số để đảm bảo tính chính xác (xử lý các giá trị điều chỉnh âm).

---

### Giai đoạn 4: Hoàn thiện & Tính năng Nâng cao

**Mục tiêu:** Hoàn thiện luồng quản lý và bổ sung các tính năng quan trọng khác được đề cập trong tầm nhìn.

#### Nhiệm vụ Frontend & Backend:
1.  **Quản lý Negative Targeting:**
    -   Thêm các tab/khu vực trong `AdGroupView` và `CampaignView` để người dùng xem và thêm các Negative Keywords / Negative ASINs.
    -   Tạo các API endpoint tương ứng để đọc và ghi dữ liệu này.
2.  **Quản lý Ad (Sản phẩm):**
    -   Trong `AdGroupView`, thêm một khu vực để hiển thị danh sách các sản phẩm (ASIN, hình ảnh, tiêu đề) đang được quảng cáo trong nhóm đó.
    -   Tạo API để lấy danh sách Ads từ Amazon.
3.  **Tối ưu hóa Trải nghiệm Người dùng:**
    -   Triển khai các bộ lọc và chức năng tìm kiếm mạnh mẽ trong tất cả các bảng dữ liệu.
    -   Thêm chức năng "Tùy chỉnh cột" để người dùng có thể chọn các chỉ số họ muốn xem.
    -   Cho phép xuất dữ liệu ra file CSV ở mỗi cấp độ.
4.  **(Tương lai) Hỗ trợ Sponsored Brands & Display:**
    -   Mở rộng cấu trúc hiện tại để có thể xử lý các loại chiến dịch khác, với các logic và giao diện đặc thù (quản lý headline, creative, audience targeting).
