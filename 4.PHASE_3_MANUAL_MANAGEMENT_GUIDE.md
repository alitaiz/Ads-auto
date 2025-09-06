# Hướng Dẫn Chi Tiết Triển Khai Giai Đoạn 3: Lấy Dữ liệu & Quản lý Thủ công

## Giới thiệu

Chào mừng bạn đến với Giai đoạn 3! Ở các giai đoạn trước, chúng ta đã xây dựng nền tảng hạ tầng và tích hợp luồng dữ liệu thời gian thực. Bây giờ là lúc biến ứng dụng của chúng ta từ một công cụ "chỉ xem" thành một trung tâm "quản lý" thực thụ.

**Mục tiêu cuối cùng của giai đoạn này:**
- Xây dựng một giao diện bảng (table) hiển thị tất cả các chiến dịch Sponsored Products của bạn.
- Lấy dữ liệu **trực tiếp và mới nhất** từ Amazon Ads API.
- Cho phép người dùng thực hiện các thay đổi cơ bản trực tiếp trên giao diện như: **bật/tắt chiến dịch** và **thay đổi ngân sách hàng ngày**.
- Xây dựng nền tảng cho việc xem chi tiết (drill-down) trong tương lai.

Giai đoạn này là bước đệm cực kỳ quan trọng trước khi chúng ta xây dựng bộ máy tự động hóa ở Giai đoạn 4. Hãy bắt đầu!

---

## Phần A: Backend - Xây dựng Cầu nối API đến Amazon

**Mục tiêu:** Tạo các API endpoint trên server Node.js. Các endpoint này sẽ đóng vai trò trung gian, nhận lệnh từ frontend, sau đó giao tiếp với Amazon Ads API một cách an toàn để lấy dữ liệu hoặc thực hiện thay đổi.

### Bước 1: Hiểu Luồng Hoạt động

Luồng hoạt động sẽ như sau:
`Giao diện Người dùng (Frontend)` ↔️ `API trên VPS của bạn (Backend)` ↔️ `Amazon Ads API`

- **Tại sao cần Backend làm trung gian?** Vì lý do **bảo mật**. Chúng ta không bao giờ đưa các khóa bí mật (API keys, refresh tokens) ra ngoài frontend. Backend sẽ quản lý chúng một cách an toàn và xử lý toàn bộ logic xác thực với Amazon.

### Bước 2: Tái cấu trúc Backend cho API Amazon

Để giữ code sạch sẽ và dễ bảo trì, chúng ta sẽ tạo ra các file chuyên biệt để xử lý việc giao tiếp với Amazon.

1.  **File Helper (`backend/helpers/amazon-api.js`):**
    -   **Mục đích:** Tập trung toàn bộ logic phức tạp của việc xác thực (lấy và làm mới access token) và thực hiện các lệnh gọi API đến Amazon vào một nơi duy nhất.
    -   **Chức năng chính:** Cung cấp hàm `getAdsApiAccessToken()` để đảm bảo chúng ta luôn có một token hợp lệ và một hàm `amazonAdsApiRequest` để dễ dàng thực hiện các yêu cầu tới API của Amazon.
    -   **Tham khảo:** Xem file `backend/helpers/amazon-api.js` để biết chi tiết triển khai.

2.  **File Router (`backend/routes/ppcManagementApi.js`):**
    -   **Mục đích:** Định nghĩa tất cả các "cửa ngõ" (endpoints) mà frontend có thể gọi để quản lý PPC.
    -   **Các Endpoints chính:**
        -   `GET /api/amazon/profiles`: Lấy danh sách các tài khoản quảng cáo (profiles) mà người dùng có quyền truy cập.
        -   `POST /api/amazon/campaigns/list`: Lấy danh sách chi tiết các chiến dịch cho một profile được chọn.
        -   `PUT /api/amazon/campaigns`: Cập nhật thông tin cho một hoặc nhiều chiến dịch (ví dụ: thay đổi trạng thái, ngân sách).
    -   **Tham khảo:** File `backend/routes/ppcManagementApi.js` chứa định nghĩa đầy đủ của các routes này.

3.  **Cập nhật Server chính (`backend/server.js`):**
    -   **Mục đích:** "Đăng ký" router mới tạo ở trên vào ứng dụng Express chính.
    -   **Hành động:** Thêm một dòng để Express biết rằng tất cả các yêu cầu bắt đầu bằng `/api/amazon` sẽ được xử lý bởi `ppcManagementApi.js`.

4.  **Cập nhật Dependencies (`backend/package.json`):**
    -   **Hành động:** Thêm thư viện `axios` vào dự án để giúp việc thực hiện các yêu cầu HTTP trong file helper trở nên dễ dàng hơn.

---

## Phần B: Frontend - Xây dựng Giao diện Quản lý Tương tác

**Mục tiêu:** Cập nhật giao diện `PPCManagementView` để nó có thể "nói chuyện" với backend mới của chúng ta và cho phép người dùng tương tác trực tiếp với dữ liệu.

### Bước 3: Cập nhật `index.tsx` và `types.ts`

1.  **Thiết lập Routing (`index.tsx`):**
    -   **Mục đích:** Chuẩn bị nền tảng cho tính năng xem chi tiết (drill-down) sau này bằng cách thêm bộ định tuyến (router) cho toàn bộ ứng dụng.
    -   **Tham khảo:** File `index.tsx` mới được tạo sẽ bao gồm thiết lập này.

2.  **Định nghĩa Kiểu dữ liệu (`types.ts`):**
    -   **Mục đích:** Tạo một nơi tập trung để định nghĩa các cấu trúc dữ liệu (như `Campaign`, `Profile`) được sử dụng ở cả frontend và backend, giúp code nhất quán và dễ hiểu hơn.
    -   **Tham khảo:** File `types.ts` mới đã được tạo với các định nghĩa cần thiết.

### Bước 4: Nâng cấp `PPCManagementView.tsx`

Đây là phần thay đổi lớn và thú vị nhất. Giao diện quản lý chiến dịch sẽ được làm lại hoàn toàn để trở nên thông minh và tương tác hơn.

1.  **Luồng Lấy dữ liệu Mới:**
    -   **Chọn Profile:** Giao diện giờ đây sẽ có một dropdown để người dùng chọn tài khoản quảng cáo (profile) họ muốn xem.
    -   **Tải Chiến dịch:** Ngay sau khi chọn profile, ứng dụng sẽ tự động gọi đến endpoint `/api/amazon/campaigns/list` để tải danh sách chiến dịch.
    -   **Trạng thái Tải:** Giao diện sẽ hiển thị thông báo "Loading..." và xử lý các lỗi có thể xảy ra một cách mượt mà.

2.  **Triển khai Chức năng Chỉnh sửa Tại chỗ (In-line Editing):**
    -   **Bật/Tắt Trạng thái:** Thay vì chỉ hiển thị text, cột "Status" giờ đây là một nút bấm tương tác.
    -   **Chỉnh sửa Ngân sách:** Cột "Budget" cũng có thể được chỉnh sửa trực tiếp. Khi người dùng nhấp vào, nó sẽ biến thành một ô nhập liệu.
    -   **Cơ chế hoạt động:** Khi người dùng thay đổi trạng thái hoặc ngân sách, giao diện sẽ:
        1.  **Cập nhật Giao diện Tức thì (Optimistic Update):** Thay đổi sẽ được hiển thị ngay trên màn hình để mang lại trải nghiệm mượt mà, không có độ trễ.
        2.  **Gửi Yêu cầu Ngầm:** Một yêu cầu `PUT` sẽ được gửi đến endpoint `/api/amazon/campaigns` ở backend để lưu thay đổi lên Amazon.
        3.  **Xử lý Kết quả:** Nếu yêu cầu thành công, thay đổi được xác nhận. Nếu thất bại, giao diện sẽ tự động hoàn tác lại trạng thái cũ và hiển thị thông báo lỗi chi tiết cho người dùng.

3.  **Nền tảng cho Xem chi tiết:**
    -   Tên mỗi chiến dịch giờ đây là một đường link (hiện tại chưa hoạt động). Đây là bước chuẩn bị để ở các phiên bản sau, người dùng có thể nhấp vào để xem các nhóm quảng cáo bên trong chiến dịch đó.

**Tham khảo:** Toàn bộ logic mới này đã được triển khai trong file `views/PPCManagementView.tsx`. Hãy xem kỹ file này để hiểu cách các state được quản lý và các hàm API được gọi như thế nào.

---

## Hoàn tất!

Chúc mừng! Sau khi hoàn thành các bước trên, ứng dụng của bạn đã có khả năng quản lý chiến dịch cơ bản và mạnh mẽ. Người dùng có thể xem dữ liệu mới nhất, lọc, và thực hiện các thay đổi nhanh chóng.

**Các bước tiếp theo:**
- Hoàn thiện giao diện chỉnh sửa cho các cột khác (giá thầu, v.v.).
- Xây dựng hoàn chỉnh luồng xem chi tiết (drill-down) bằng cách tạo các trang cho Ad Groups và Keywords.
- Chuẩn bị cho **Giai đoạn 4: Xây dựng Bộ máy Tự động hóa Dựa trên Luật**, nơi chúng ta sẽ sử dụng nền tảng quản lý này để tạo ra các quy tắc tối ưu tự động.