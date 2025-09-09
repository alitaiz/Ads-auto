# Lộ trình Cải tiến Giao diện Quản lý PPC (PPC Management UI/UX Roadmap)

## 1. Cấu trúc tổng thể UI/UX

### Thanh điều hướng trên cùng
- Hiển thị ngày (ví dụ: `8 September 2025`).
- Các tab chính:
    - Portfolios
    - Campaigns
    - Ad groups
    - Keywords
    - Search terms

### Khu vực hiển thị nội dung
- Nội dung thay đổi theo tab được chọn.
- Mỗi tab chứa một bảng dữ liệu với các cột và chức năng riêng.

---

## 2. Chi tiết các Tab

### 📊 Tab: Campaigns
Bảng hiển thị danh sách chiến dịch quảng cáo.

**Cấu trúc bảng:**
- **Name:** Tên (campaign/ad group/keyword/search term). Hỗ trợ expand/collapse theo cấp độ.
- **Products:** Ảnh và mã sản phẩm (nếu có).
- **Status:** Trạng thái (Active / —).
- **Cost per order (CPO):** Chi phí mỗi đơn hàng.
- **Ad spend:** Chi phí quảng cáo.
- **Clicks:** Số lần nhấp chuột.
- **Conversion %:** Tỷ lệ chuyển đổi.
- **Orders:** Số đơn hàng.
- **Units:** Số sản phẩm bán ra.
- **CPC:** Chi phí mỗi lần nhấp (Cost per click).
- **PPC sales:** Doanh số từ PPC.
- **Impressions:** Số lượt hiển thị.
- **Same SKU/All SKU’s:** Tỷ lệ bán cùng SKU.
- **ACOS:** Advertising Cost of Sales.

**Tính năng hàng dữ liệu:**
- **Expandable:** Có thể mở rộng để xem chi tiết Ad Groups, Keywords, và Search Terms bên trong.
- **Biểu tượng:** Icon cờ (🇺🇸) hoặc `SP`/`SD` để biểu thị loại quảng cáo/quốc gia.

### 📊 Tab: Ad Groups
Tương tự tab Campaigns nhưng tập trung vào các nhóm quảng cáo.

**Cấu trúc bảng:**
- Name, Status, CPO, Ad spend, Clicks, Conversion %, Orders, Units, CPC, PPC sales, Impressions, ACOS.

**Hiển thị dữ liệu theo cấp độ:**
1.  Ad Group (có thể expand).
2.  Keyword và Search Term bên trong Ad Group.

### 📊 Tab: Keywords
Hiển thị danh sách các từ khóa được nhắm mục tiêu (targeting) và các cụm từ tìm kiếm thực tế (search terms) tương ứng.

**Cấu trúc bảng:**
- **Name:** Keyword hoặc Search Term.
- **Products:** (nếu có).
- Cost per order
- Ad spend
- Clicks
- Conversion %
- Orders
- Units
- CPC
- PPC Sales
- Impressions
- ACOS
- **Current bid:** Giá thầu hiện tại.

### 📊 Tab: Search Terms
Hiển thị các cụm từ tìm kiếm thực tế mà khách hàng đã sử dụng.

**Cấu trúc bảng:**
- **Name:** Search Term.
- Cost per order
- Ad spend
- Clicks
- Conversion %
- Orders
- Units
- CPC
- Impressions
- ACOS

---

## 3. 🎯 Các Tính năng UX Quan trọng

-   **Expandable Rows (Hàng có thể mở rộng):** Triển khai cấu trúc phân cấp `Campaign → Ad Group → Keyword → Search Term`.
-   **Icons & Labels (Biểu tượng & Nhãn):**
    -   `SP` = Sponsored Product.
    -   `SD` = Sponsored Display.
    -   `🇺🇸` (Cờ) để hiển thị vùng/quốc gia.
-   **Inline Status Control (Điều khiển Trạng thái tại chỗ):** Dropdown để chuyển đổi giữa "Active" và "Paused".
-   **Sorting & Filtering (Sắp xếp & Lọc):** Các cột trong bảng có thể được sắp xếp bằng cách nhấp vào tiêu đề cột.
-   **Metrics Hiển thị Rõ ràng:** Mỗi hàng dữ liệu hiển thị đầy đủ các chỉ số quan trọng như chi phí, click, tỷ lệ chuyển đổi, đơn hàng, và doanh số.
