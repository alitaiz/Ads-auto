# Hướng dẫn Thiết lập Reverse SSH Tunnel để Kết nối VPS tới Database Local

## 1. Mục tiêu

Tài liệu này hướng dẫn chi tiết cách thiết lập một **Reverse SSH Tunnel** (Đường hầm SSH Ngược) an toàn và ổn định. Phương pháp này cho phép ứng dụng của bạn chạy trên một máy chủ công cộng (VPS) có thể kết nối và truy vấn một cơ sở dữ liệu PostgreSQL đang chạy trên máy tính cá nhân (local) trong mạng nội bộ.

Đây là giải pháp **an toàn nhất và được khuyến nghị** vì nó không yêu cầu bạn phải "mở cổng" (port forwarding) trên router, giúp bảo vệ máy tính cá nhân của bạn khỏi các truy cập trái phép từ internet.

---

## 2. Tổng quan Cách hoạt động

Thay vì VPS chủ động kết nối *vào* máy local (điều này là không thể vì máy local không có IP công khai), chúng ta sẽ làm ngược lại: **Máy local sẽ chủ động tạo một kết nối SSH *ra* VPS.**

Luồng hoạt động như sau:
1.  **Máy local (Windows 11)** tạo một kết nối SSH an toàn đến **VPS (Ubuntu)**.
2.  Trong quá trình tạo kết nối, máy local yêu cầu VPS: "Hãy mở một cổng trên chính anh (ví dụ: cổng `54321`), và bất kỳ ai kết nối vào cổng đó, hãy chuyển tiếp (forward) toàn bộ dữ liệu qua đường hầm này về cho tôi ở cổng `5432` (cổng PostgreSQL của tôi)".
3.  **Ứng dụng trên VPS** chỉ cần kết nối tới `localhost:54321` (chính nó). Dịch vụ SSH sẽ tự động và minh bạch chuyển tiếp yêu cầu đó về máy local.



---

## 3. Yêu cầu

-   Bạn có quyền truy cập `sudo` vào VPS Ubuntu 22.04.
-   Bạn có một SSH client trên máy Windows 11 (PowerShell hoặc Windows Terminal đã có sẵn OpenSSH).
-   PostgreSQL đã được cài đặt và đang chạy trên máy Windows 11.

---

## 4. Các bước Triển khai

### Phần A: Cấu hình trên VPS (Chỉ làm một lần)

Mục đích của bước này là cho phép đường hầm SSH nhận kết nối từ các ứng dụng khác, không chỉ từ chính nó.

1.  **Kết nối vào VPS của bạn qua SSH.**
    ```bash
    ssh your_username@your_vps_ip
    ```

2.  **Chỉnh sửa file cấu hình SSH Daemon.**
    Mở file với `nano`:
    ```bash
    sudo nano /etc/ssh/sshd_config
    ```

3.  **Bật `GatewayPorts`.**
    Tìm dòng `#GatewayPorts no` hoặc `GatewayPorts no`. Sửa nó thành:
    ```sshd-config
    GatewayPorts yes
    ```
    > **Giải thích:** Mặc định, cổng được mở bởi đường hầm chỉ lắng nghe trên địa chỉ `127.0.0.1` (localhost) của VPS. Bật `GatewayPorts yes` cho phép cổng này lắng nghe trên `0.0.0.0`, nghĩa là ứng dụng của bạn (chạy như một tiến trình riêng) có thể kết nối vào nó.

4.  **Lưu file và khởi động lại dịch vụ SSH.**
    -   Nhấn `Ctrl + X`, sau đó `Y`, và `Enter` để lưu file.
    -   Áp dụng thay đổi bằng cách khởi động lại SSH:
        ```bash
        sudo systemctl restart sshd
        ```

### Phần B: Cấu hình PostgreSQL trên máy Local (Chỉ làm một lần)

Mục đích là đảm bảo PostgreSQL cho phép các kết nối từ đường hầm SSH.

1.  **Cho phép PostgreSQL lắng nghe trên `localhost`.**
    -   Tìm file `postgresql.conf` của bạn (thường ở `C:\Program Files\PostgreSQL\<version>\data\`).
    -   Mở file và tìm dòng `listen_addresses`. Đảm bảo nó được cấu hình là:
        ```postgresql-conf
        listen_addresses = 'localhost'
        ```
    > **Giải thích:** Điều này đảm bảo PostgreSQL chỉ chấp nhận kết nối từ chính máy tính đó, bao gồm cả kết nối từ đường hầm SSH được chuyển tiếp về. Đây là cấu hình an toàn nhất.

2.  **Cho phép người dùng database xác thực.**
    -   Tìm file `pg_hba.conf` trong cùng thư mục `data`.
    -   Thêm dòng sau vào cuối file, thay `your_db_user` bằng tên người dùng database thực tế của bạn:
        ```postgresql-conf
        # TYPE  DATABASE        USER            ADDRESS                 METHOD
        host    all             your_db_user    127.0.0.1/32            scram-sha-256
        ```
    > **Giải thích:** Dòng này cho phép `your_db_user` kết nối vào tất cả các database từ địa chỉ `127.0.0.1` (localhost) bằng mật khẩu đã được mã hóa.

3.  **Khởi động lại dịch vụ PostgreSQL.**
    -   Mở "Services" trên Windows, tìm dịch vụ có tên `postgresql-x64-<version>`, và nhấn "Restart".

### Phần C: Tạo Đường hầm từ máy Local

Đây là lệnh bạn sẽ chạy mỗi khi cần kết nối.

1.  **Mở PowerShell hoặc Windows Terminal trên máy Windows 11 của bạn.**

2.  **Chạy lệnh Reverse SSH Tunnel.**
    ```powershell
    ssh -R 54321:localhost:5432 your_username@your_vps_ip
    ```
    **Giải thích lệnh:**
    -   `ssh`: Khởi chạy chương trình SSH.
    -   `-R`: Viết tắt của **R**everse. Đây là cờ để tạo đường hầm ngược.
    -   `54321`: Cổng sẽ được mở trên **VPS**. Bạn có thể chọn một số cổng khác nếu muốn (ví dụ: 6000), miễn là nó chưa được sử dụng.
    -   `localhost`: Địa chỉ mà **VPS** sẽ chuyển tiếp đến. Ở đây là máy **local** của bạn.
    -   `5432`: Cổng PostgreSQL đang chạy trên máy **local** của bạn.
    -   `your_username@your_vps_ip`: Thông tin đăng nhập SSH vào VPS của bạn.

3.  **Giữ cho cửa sổ Terminal chạy.**
    Sau khi chạy lệnh và nhập mật khẩu, bạn sẽ đăng nhập vào VPS. Đường hầm sẽ tồn tại miễn là cửa sổ terminal này còn mở.

### Phần D: Cập nhật Cấu hình Ứng dụng trên VPS

1.  **Chỉnh sửa file `.env` của backend.**
    Mở file `backend/.env` trên VPS và cập nhật thông tin kết nối database:
    ```dotenv
    DB_HOST=localhost
    DB_PORT=54321
    DB_USER=your_db_user
    DB_PASSWORD=your_db_password
    DB_DATABASE=your_db_name
    ```
    > **Lưu ý:** `DB_HOST` là `localhost` vì ứng dụng trên VPS đang kết nối vào chính cổng mà SSH đã mở trên VPS.

2.  **Khởi động lại ứng dụng backend.**
    Nếu bạn đang dùng PM2:
    ```bash
    pm2 restart your-app-name
    ```

**Hoàn tất!** Ứng dụng của bạn giờ đã có thể truy vấn dữ liệu từ database trên máy local một cách an toàn.

---

## 5. (Nâng cao) Giữ cho Đường hầm Luôn hoạt động với `autossh`

Việc phải giữ một cửa sổ terminal mở là không lý tưởng. `autossh` là một công cụ giúp tự động khởi động và duy trì kết nối SSH, tự kết nối lại nếu bị ngắt.

1.  **Cài đặt `autossh` trên Windows:**
    -   Cách dễ nhất là thông qua [WSL (Windows Subsystem for Linux)](https://learn.microsoft.com/en-us/windows/wsl/install). Sau khi cài WSL (ví dụ với Ubuntu), bạn có thể cài `autossh` bằng lệnh:
        ```bash
        sudo apt-get install autossh
        ```

2.  **Sử dụng `autossh`:**
    Lệnh tương tự như `ssh` nhưng có thêm một vài cờ:
    ```bash
    autossh -M 0 -f -N -R 54321:localhost:5432 your_username@your_vps_ip
    ```
    -   `-M 0`: Tắt cổng giám sát.
    -   `-f`: Chạy ở chế độ nền (background).
    -   `-N`: Không thực thi lệnh nào trên remote, chỉ chuyển tiếp cổng.

---

## 6. Xử lý sự cố (Troubleshooting)

-   **Lỗi "Connection refused" trên VPS:**
    -   Kiểm tra xem `GatewayPorts yes` đã được thiết lập trong `sshd_config` và dịch vụ SSH đã được khởi động lại chưa.
    -   Kiểm tra tường lửa (UFW) trên VPS có chặn cổng `54321` không.

-   **Lỗi xác thực PostgreSQL (Password authentication failed):**
    -   Kiểm tra lại file `pg_hba.conf` trên máy local, đảm bảo dòng `host all your_db_user 127.0.0.1/32 scram-sha-sha256` là chính xác.
    -   Đảm bảo bạn đã khởi động lại dịch vụ PostgreSQL.

-   **Đường hầm bị ngắt kết nối thường xuyên:**
    -   Sử dụng `autossh` để tự động kết nối lại.
    -   Bạn cũng có thể thêm các tùy chọn `ServerAliveInterval 60` và `ServerAliveCountMax 3` vào lệnh `ssh` hoặc `autossh` để giữ kết nối.
```
-   **Lỗi "bind: Address already in use" khi chạy lệnh SSH:**
    -   Một tiến trình khác trên VPS đã sử dụng cổng `54321`. Hãy chọn một số cổng khác (ví dụ: `54322`).
```

