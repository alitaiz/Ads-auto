// views/components/RuleGuideContent.tsx
import React from 'react';

const guideStyles: { [key: string]: React.CSSProperties } = {
    container: { lineHeight: 1.6, color: '#333', backgroundColor: 'var(--card-background-color)', padding: '20px 40px', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)' },
    h1: { fontSize: '2em', borderBottom: '2px solid var(--border-color)', paddingBottom: '10px', marginBottom: '20px' },
    h2: { fontSize: '1.75em', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginTop: '40px', marginBottom: '20px' },
    h3: { fontSize: '1.5em', marginTop: '30px', marginBottom: '15px' },
    h4: { fontSize: '1.2em', marginTop: '25px', marginBottom: '10px', color: '#111' },
    p: { marginBottom: '15px' },
    ul: { paddingLeft: '20px', marginBottom: '15px' },
    ol: { paddingLeft: '20px', marginBottom: '15px' },
    li: { marginBottom: '8px' },
    code: { backgroundColor: '#eef', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', color: '#d63384' },
    blockquote: { borderLeft: '4px solid var(--primary-color)', paddingLeft: '15px', margin: '20px 0', fontStyle: 'italic', color: '#555', backgroundColor: '#f8f9fa' },
};

export function RuleGuideContent() {
    return (
        <div style={guideStyles.container}>
            <h1 style={guideStyles.h1}>Hướng dẫn Toàn diện về Tự động hóa PPC</h1>

            <h2 style={guideStyles.h2}>1. Giới thiệu - Sức mạnh của Tự động hóa</h2>
            <p style={guideStyles.p}>
                Chào mừng bạn đến với <strong>Automation Center</strong>, trung tâm điều khiển mạnh mẽ được thiết kế để giúp bạn tiết kiệm thời gian, giảm chi tiêu lãng phí và tối ưu hóa hiệu suất quảng cáo 24/7. Thay vì phải kiểm tra và điều chỉnh thủ công hàng ngày, bạn có thể thiết lập các "luật" (rules) thông minh để hệ thống tự động làm việc thay bạn, dựa trên các mục tiêu kinh doanh thực tế của bạn.
            </p>
            <p style={guideStyles.p}>
                Công cụ này cho phép bạn thực hiện ba loại tự động hóa chính:
            </p>
            <ol style={guideStyles.ol}>
                <li style={guideStyles.li}><strong>Điều chỉnh Bid (Bid Adjustment):</strong> Tự động tăng hoặc giảm giá thầu của từ khóa/mục tiêu dựa trên các chỉ số hiệu suất như ACOS, ROAS, v.v.</li>
                <li style={guideStyles.li}><strong>Quản lý Search Term (Search Term Automation):</strong> Tự động phân tích các cụm từ tìm kiếm của khách hàng để <strong>phủ định</strong> những cụm từ không hiệu quả.</li>
                <li style={guideStyles.li}><strong>Tăng tốc Ngân sách (Budget Acceleration):</strong> Tự động tăng ngân sách cho các chiến dịch đang hoạt động cực kỳ hiệu quả trong ngày để không bỏ lỡ doanh thu tiềm năng.</li>
            </ol>
            <p style={guideStyles.p}>
                Tài liệu này sẽ giải thích các khái niệm cốt lõi, hướng dẫn bạn cách xác định các chỉ số kinh doanh quan trọng, và cung cấp các ví dụ thực tế để bạn có thể bắt đầu ngay lập tức.
            </p>

            <h2 style={guideStyles.h2}>2. Các Khái niệm Cốt lõi (Core Concepts)</h2>
            <p style={guideStyles.p}>Để sử dụng công cụ hiệu quả, bạn cần nắm vững các khái niệm sau:</p>

            <h3 style={guideStyles.h3}>2.1. Rule (Luật)</h3>
            <p style={guideStyles.p}>Một <strong>Rule</strong> là một "container" chứa đựng một chiến lược tự động hóa hoàn chỉnh. Mỗi rule có:</p>
            <ul style={guideStyles.ul}>
                <li style={guideStyles.li}>Một cái tên (ví dụ: "Tối ưu hóa Bid theo Lợi nhuận").</li>
                <li style={guideStyles.li}>Một loại hình (Bid Adjustment, Search Term, hoặc Budget Acceleration).</li>
                <li style={guideStyles.li}>Một hoặc nhiều nhóm điều kiện logic.</li>
                <li style={guideStyles.li}>Các cài đặt về tần suất chạy và phạm vi áp dụng.</li>
            </ul>

            <h3 style={guideStyles.h3}>2.2. Condition Group (Nhóm Điều kiện - Logic IF/THEN)</h3>
            <p style={guideStyles.p}>Đây là trái tim của mỗi rule, hoạt động giống như một khối lệnh <code style={guideStyles.code}>IF ... THEN ...</code>:</p>
            <ul style={guideStyles.ul}>
                <li style={guideStyles.li}><strong>IF (NẾU):</strong> Bao gồm một hoặc nhiều điều kiện được kết nối bằng logic <strong>AND</strong>. Tất cả các điều kiện trong nhóm này phải được thỏa mãn.</li>
                <li style={guideStyles.li}><strong>THEN (THÌ):</strong> Bao gồm một hành động cụ thể sẽ được thực thi khi khối <code style={guideStyles.code}>IF</code> là đúng.</li>
            </ul>
            
            <h3 style={guideStyles.h3}>2.3. Nguyên tắc "First Match Wins" (Luật khớp đầu tiên được áp dụng)</h3>
            <p style={guideStyles.p}>Đây là nguyên tắc <strong>quan trọng nhất</strong> bạn cần ghi nhớ khi một Rule có nhiều Nhóm Điều kiện (các khối <code style={guideStyles.code}>OR IF</code>).</p>
            <ol style={guideStyles.ol}>
                <li style={guideStyles.li}><strong>Thứ tự là trên hết:</strong> Hệ thống sẽ luôn đánh giá các nhóm điều kiện theo thứ tự bạn sắp xếp chúng, <strong>từ trên xuống dưới</strong>.</li>
                <li style={guideStyles.li}><strong>Dừng lại khi tìm thấy:</strong> Ngay khi một từ khóa/mục tiêu thỏa mãn tất cả các điều kiện trong một nhóm, hệ thống sẽ thực hiện hành động của <strong>chỉ nhóm đó</strong> và <strong>ngừng xử lý</strong> thực thể đó. Nó sẽ không xét đến các nhóm bên dưới nữa.</li>
            </ol>
            <blockquote style={guideStyles.blockquote}>
