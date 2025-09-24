# Hướng dẫn Tích hợp Amazon Marketing Stream với DynamoDB qua AWS

## Mục tiêu

Tài liệu này hướng dẫn bạn cách thiết lập một pipeline dữ liệu **serverless** hoàn chỉnh trên AWS để nhận, xử lý, và ghi dữ liệu từ Amazon Marketing Stream vào **Amazon DynamoDB**. Sau đó, chúng ta sẽ public dữ liệu này ra internet thông qua **API Gateway** để frontend có thể hiển thị các chỉ số PPC gần như thời gian thực.

> **Lưu ý về Lựa chọn Dataset:** Hướng dẫn này sử dụng đồng thời hai dataset:
> - **`sp-traffic`**: Cung cấp các sự kiện về lượt hiển thị (impressions), nhấp chuột (clicks), và chi phí (cost) gần như ngay lập tức.
> - **`sp-conversion`**: Cung cấp dữ liệu về chuyển đổi (đơn hàng, doanh số) khi chúng xảy ra.
> Bằng cách kết hợp cả hai, chúng ta có thể xây dựng một dashboard PPC toàn diện với các chỉ số như ACOS và ROAS.

---

## Tổng quan Kiến trúc Serverless

**Luồng Ghi dữ liệu (Data Ingestion):**
`Amazon Ads API (sp-traffic & sp-conversion)` → `AWS Kinesis Data Firehose` → `AWS Lambda (process-marketing-stream-to-dynamodb-enkezi)` → `Amazon DynamoDB (ama_stream_data_enkezi)`
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`↘ Amazon S3 (my-amazon-stream-data-backup-enkezi-1234)`

**Luồng Đọc dữ liệu (Data Retrieval):**
`Frontend (Tab PPC Management)` → `AWS API Gateway (PPCStreamAPI-enkezi)` → `AWS Lambda (get-ppc-live-metrics-enkezi)` → `Amazon DynamoDB (ama_stream_data_enkezi)`

---

## Phân tích Chi phí (Cost Analysis)

Kiến trúc này hoàn toàn là serverless, có nghĩa là bạn chỉ trả tiền cho những gì bạn sử dụng. Với lượng dữ liệu thông thường, chi phí sẽ rất thấp:
-   **Kinesis Data Firehose:** Rất thấp, ~$0.029/GB.
-   **AWS Lambda:** Gói miễn phí lớn, chi phí gần như **$0/tháng**.
-   **Amazon DynamoDB:** Gói miễn phí lớn, chi phí gần như **$0/tháng**.
-   **Amazon S3:** Vài cent mỗi tháng để sao lưu.
-   **API Gateway:** Gói miễn phí lớn.

**Tổng chi phí ước tính: ~$1-2/tháng, có khả năng là $0 nếu nằm trong gói miễn phí.**

---

## Yêu cầu

1.  **Tài khoản AWS & AWS CLI:** Đã cài đặt và cấu hình.
2.  **Quyền Admin trên Amazon Ads:** Để đăng ký stream.

---

## Phần 1: Thiết lập Pipeline Ghi Dữ liệu

### Bước 1: AWS - Tạo Bảng DynamoDB

Đây là nơi dữ liệu stream sẽ được lưu trữ.
1.  Mở dịch vụ **Amazon DynamoDB**.
2.  Nhấp **"Create table"**.
3.  **Table name:** `ama_stream_data_enkezi`.
4.  **Partition key:** `event_id`, **Type:** `String`.
5.  **Sort key:** `timestamp`, **Type:** `Number`.
6.  Để các cài đặt còn lại mặc định và nhấp **"Create table"**.

### Bước 2: AWS - Tạo IAM Role cho Lambda Ghi dữ liệu

Lambda function cần quyền để ghi log và ghi dữ liệu vào DynamoDB.
1.  Mở dịch vụ **IAM** -> **Roles** -> **"Create role"**.
2.  **Trusted entity type:** Chọn **AWS service**, Use case: **Lambda**.
3.  **Add permissions:** Tìm và thêm 2 policies sau:
    - `AWSLambdaBasicExecutionRole` (để ghi logs)
    - `AmazonDynamoDBFullAccess` (để ghi dữ liệu vào DynamoDB)
4.  **Role name:** `Lambda-StreamProcessor-DynamoDB-Role-enkezi`.
5.  Nhấp **"Create role"**.

### Bước 3: AWS - Tạo Lambda Function Ghi dữ liệu

Function này sẽ nhận dữ liệu từ Firehose, xử lý và ghi vào DynamoDB.
1.  Mở dịch vụ **Lambda** -> **"Create function"**.
2.  **Function name:** `process-marketing-stream-to-dynamodb-enkezi`.
3.  **Runtime:** **Node.js 20.x**.
4.  **Permissions:** Chọn **"Use an existing role"** và chọn `Lambda-StreamProcessor-DynamoDB-Role-enkezi` đã tạo ở trên.
5.  Nhấp **"Create function"**.
6.  Trong tab **Code source**, dán nội dung từ file `lambda_deployment_package/index.mjs.txt` vào file `index.mjs`.
7.  Trong tab **Configuration** -> **Environment variables**, thêm biến sau:
    -   Key: `DYNAMODB_TABLE_NAME`, Value: `ama_stream_data_enkezi`
8.  Trong **General configuration**, tăng **Timeout** lên `1 minute`.
9.  Nhấp **"Deploy Changes"**.

### Bước 4: AWS - Cấu hình Firehose

Firehose sẽ nhận dữ liệu từ Amazon và chuyển tiếp đến Lambda của chúng ta.
1.  Mở **Kinesis** -> **Delivery streams** -> **"Create delivery stream"**.
2.  **Source:** `Direct PUT`.
3.  **Destination:** `Amazon S3`.
4.  **Delivery stream name:** `amazon-ads-firehose-stream-enkezi`.
5.  Trong mục **Data transformation**, chọn **Enabled**.
6.  **Lambda function:** Chọn `process-marketing-stream-to-dynamodb-enkezi`.
7.  **Destination settings (S3 Backup):** Chọn S3 bucket bạn muốn dùng để sao lưu dữ liệu thô: `my-amazon-stream-data-backup-enkezi-1234`.
8.  Nhấp **"Create delivery stream"** và sao chép **ARN** của stream.

### Bước 5: AWS - Tạo IAM Roles cho Amazon Ads

Bước này cho phép tài khoản Amazon Ads gửi dữ liệu vào tài khoản AWS của bạn. *Bạn chỉ cần làm một lần.*
(Sử dụng các tên role mà bạn đã cung cấp: `AmazonAds-Firehose-Subscription-Role-enkezi` và `AmazonAds-Firehose-Subscriber-Role-enkezi`)

Làm theo hướng dẫn chi tiết của Amazon [tại đây](https://advertising.amazon.com/API/docs/en-us/amazon-marketing-stream-guides/create-iam-resources) để tạo 2 roles này. Đảm bảo:
- **Subscription Role** có quyền `firehose:PutRecord` trên ARN của Firehose bạn vừa tạo.
- **Subscriber Role** có quyền `iam:PassRole` trên ARN của Subscription Role.
- Trust policies được cấu hình để tin tưởng Account ID của Amazon cho khu vực của bạn (NA: `926844853897`).

Sau khi tạo, **sao chép ARN** của cả hai roles.

### Bước 6: Cập nhật `.env` và Đăng ký Stream

1.  Mở file `backend/.env`.
2.  Điền đầy đủ các giá trị sau:
    ```dotenv
    ADS_API_FIREHOSE_ARN=... (ARN từ Bước 4)
    ADS_API_FIREHOSE_SUBSCRIPTION_ROLE_ARN=... (ARN của Subscription Role)
    ADS_API_FIREHOSE_SUBSCRIBER_ROLE_ARN=... (ARN của Subscriber Role)
    ```
3.  Chạy lệnh sau để đăng ký cả hai stream (`sp-traffic` và `sp-conversion`):
    ```sh
    npm run stream:subscribe
    ```

---

## Phần 2: Thiết lập API Đọc Dữ liệu

### Bước 7: AWS - Tạo IAM Role cho Lambda Đọc dữ liệu

1.  Mở **IAM** -> **Roles** -> **"Create role"**.
2.  **Trusted entity type:** **AWS service**, Use case: **Lambda**.
3.  **Add permissions:** Thêm 2 policies:
    - `AWSLambdaBasicExecutionRole`
    - `AmazonDynamoDBReadOnlyAccess`
4.  **Role name:** `Lambda-APIGateway-DynamoDB-Role-enkezi`.
5.  Nhấp **"Create role"**.

### Bước 8: AWS - Tạo Lambda Function Đọc dữ liệu

Function này sẽ được API Gateway gọi để lấy và tổng hợp dữ liệu từ DynamoDB.
1.  Mở **Lambda** -> **"Create function"**.
2.  **Function name:** `get-ppc-live-metrics-enkezi`.
3.  **Runtime:** **Node.js 20.x**.
4.  **Permissions:** Chọn **"Use an existing role"** và chọn `Lambda-APIGateway-DynamoDB-Role-enkezi`.
5.  Nhấp **"Create function"**.
6.  Trong tab **Code source**, dán nội dung từ file `lambda_deployment_package/index2.mjs.txt` vào `index.mjs`.
7.  Trong **Configuration** -> **Environment variables**, thêm biến sau:
    -   Key: `DYNAMODB_TABLE_NAME`, Value: `ama_stream_data_enkezi`
8.  Nhấp **"Deploy Changes"**.

### Bước 9: AWS - Tạo API Gateway

1.  Mở **API Gateway** -> **Build** một **REST API**.
2.  **API name:** `PPCStreamAPI-enkezi`.
3.  Trong **Actions**, chọn **"Create Resource"**.
    - **Resource Name:** `metrics`.
4.  Chọn resource `/metrics` vừa tạo, trong **Actions**, chọn **"Create Method"**.
    - Chọn **GET** từ dropdown.
5.  **Integration type:** `Lambda Function`.
    - Tích vào ô **"Use Lambda Proxy integration"**.
    - **Lambda Function:** Chọn `get-ppc-live-metrics-enkezi`.
6.  Trong **Actions**, chọn **"Enable CORS"**. Xác nhận các cài đặt mặc định.
7.  Trong **Actions**, chọn **"Deploy API"**.
    - **Deployment stage:** `[New Stage]`.
    - **Stage name:** `prod` (hoặc tên bạn muốn).
8.  Sau khi deploy, bạn sẽ thấy một **Invoke URL**. **Sao chép URL này.**

### Bước 10: Cập nhật Frontend

Bây giờ bạn cần cập nhật code frontend để gọi đến Invoke URL đã sao chép ở trên.
1.  Mở file `views/PPCManagementView.tsx`.
2.  Tìm đến hằng số `API_GATEWAY_URL`.
3.  Thay thế URL placeholder bằng **Invoke URL** của API Gateway của bạn. URL sẽ có dạng `https://xxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/metrics`.

Sau khi hoàn thành, tab PPC Management sẽ hiển thị dữ liệu live trực tiếp từ DynamoDB.