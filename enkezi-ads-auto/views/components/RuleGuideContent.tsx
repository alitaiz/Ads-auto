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
                <p style={guideStyles.p}><strong>Quy tắc vàng:</strong> Đặt các luật <strong>cụ thể nhất</strong> và có mức độ ưu tiên cao nhất (ví dụ: giảm bid mạnh nhất) ở trên cùng. Các luật chung chung hơn nên được đặt ở dưới.</p>
            </blockquote>

            <h4 style={guideStyles.h4}>Ví dụ về Tầm quan trọng của việc Sắp xếp</h4>
            <p style={guideStyles.p}>Hãy xem xét một kịch bản bạn muốn giảm bid mạnh cho các từ khóa hoạt động kém và giảm nhẹ cho các từ khóa kém hiệu quả hơn một chút.</p>
            <blockquote style={{...guideStyles.blockquote, borderColor: 'var(--danger-color)'}}>
                <h5 style={{marginTop: 0, color: 'var(--danger-color)'}}>Sắp xếp SAI</h5>
                <ol style={guideStyles.ol}>
                    <li style={guideStyles.li}><code style={guideStyles.code}>IF ACOS (14 ngày) &gt; 30%</code> <strong>THEN</strong> <code style={guideStyles.code}>Giảm bid 5%</code> (Luật chung chung)</li>
                    <li style={guideStyles.li}><code style={guideStyles.code}>OR IF ACOS (14 ngày) &gt; 30%</code> <strong>AND</strong> <code style={guideStyles.code}>Spend (14 ngày) &gt; $50</code> <strong>THEN</strong> <code style={guideStyles.code}>Giảm bid 20%</code> (Luật cụ thể hơn)</li>
                </ol>
                <p style={guideStyles.p}><strong>Kết quả:</strong> Nếu một từ khóa có <code style={guideStyles.code}>ACOS = 35%</code> và <code style={guideStyles.code}>Spend = $60</code>, nó sẽ chỉ bị giảm 5%. Lý do là vì nó đã khớp với luật đầu tiên, và hệ thống sẽ không bao giờ xét đến luật thứ hai mạnh hơn và phù hợp hơn.</p>
            </blockquote>

            <blockquote style={{...guideStyles.blockquote, borderColor: 'var(--success-color)'}}>
                <h5 style={{marginTop: 0, color: 'var(--success-color)'}}>Sắp xếp ĐÚNG</h5>
                <ol style={guideStyles.ol}>
                    <li style={guideStyles.li}><code style={guideStyles.code}>IF ACOS (14 ngày) &gt; 30%</code> <strong>AND</strong> <code style={guideStyles.code}>Spend (14 ngày) &gt; $50</code> <strong>THEN</strong> <code style={guideStyles.code}>Giảm bid 20%</code></li>
                    <li style={guideStyles.li}><code style={guideStyles.code}>OR IF ACOS (14 ngày) &gt; 30%</code> <strong>THEN</strong> <code style={guideStyles.code}>Giảm bid 5%</code></li>
                </ol>
                <p style={guideStyles.p}><strong>Kết quả:</strong> Với cách sắp xếp này, từ khóa có hiệu suất tệ nhất (<code style={guideStyles.code}>ACOS = 35%</code>, <code style={guideStyles.code}>Spend = $60</code>) sẽ được xử lý bởi luật mạnh nhất trước tiên và bị giảm bid 20%. Một từ khóa khác có <code style={guideStyles.code}>ACOS = 35%</code> nhưng <code style={guideStyles.code}>Spend = $10</code> sẽ không khớp với luật đầu tiên và sẽ được xử lý bởi luật thứ hai, chỉ giảm 5%. Đây là hành vi đúng đắn và có chiến lược.</p>
            </blockquote>

            <h2 style={guideStyles.h2}>3. Nền tảng Chiến lược</h2>
            
            <h3 style={guideStyles.h3}>3.1. Phần 1: Tính toán ACoS Hòa vốn & ACoS Mục tiêu</h3>
            <p style={guideStyles.p}>Trước khi tạo bất kỳ rule nào, bạn phải trả lời câu hỏi quan trọng nhất: "Với mỗi sản phẩm, tôi có thể chi bao nhiêu cho quảng cáo mà vẫn có lãi?" Câu trả lời chính là <strong>ACoS Hòa vốn (Break-Even ACoS)</strong>.</p>
            <p style={guideStyles.p}><strong>Công thức:</strong> <code style={guideStyles.code}>ACoS Hòa vốn = Lợi nhuận trước Chi phí Quảng cáo / Giá bán sản phẩm</code></p>
            <p style={guideStyles.p}><strong>ACoS Mục tiêu (Target ACoS)</strong> phải <strong>thấp hơn</strong> ACoS Hòa vốn để đảm bảo có lợi nhuận. Ví dụ, nếu ACoS hòa vốn là 25%, bạn có thể đặt ACoS Mục tiêu là <strong>15-20%</strong>.</p>
            
            <h3 style={guideStyles.h3}>3.2. Phần 2: Xác định Ngưỡng Click Hòa Vốn (Break-Even Clicks)</h3>
            <p style={guideStyles.p}>Khi tạo các rule phủ định, bạn thường thấy các điều kiện như <code style={guideStyles.code}>IF clicks &gt; 12 AND orders = 0</code>. Việc chọn một con số tùy ý có thể khiến bạn phủ định các từ khóa quá sớm (bỏ lỡ cơ hội) hoặc quá muộn (lãng phí tiền).</p>
            <p style={guideStyles.p}>Cách tiếp cận của chuyên gia là sử dụng <strong>Tỷ lệ Chuyển đổi (Conversion Rate - CVR)</strong> để xác định một ngưỡng click hợp lý về mặt thống kê.</p>
            <p style={guideStyles.p}><strong>Công thức:</strong> <code style={guideStyles.code}>Ngưỡng Click = 1 / Tỷ lệ Chuyển đổi mục tiêu</code></p>
            <p style={guideStyles.p}>Nếu CVR trung bình của sản phẩm bạn là <strong>8%</strong>, thì về mặt lý thuyết, bạn cần <code style={guideStyles.code}>1 / 0.08 = 12.5</code> lượt nhấp để có một đơn hàng. Nếu một từ khóa nhận được <strong>13-15 clicks</strong> mà vẫn không có đơn hàng nào, đó là một dấu hiệu mạnh mẽ để xem xét hành động.</p>
            
            <h2 style={guideStyles.h2}>4. Tự động hóa Điều chỉnh Bid: Chiến lược & Ví dụ</h2>
            <p style={guideStyles.p}>Tự động điều chỉnh giá thầu để tối ưu hóa chi tiêu và lợi nhuận.</p>
            <h4 style={guideStyles.h4}>Ví dụ: Rule "Tối ưu ACoS theo Tầng"</h4>
            <p style={guideStyles.p}><strong>Tên Rule:</strong> <code style={guideStyles.code}>[SP-C] Tối ưu ACoS theo Tầng</code></p>
            <ul style={guideStyles.ul}>
                <li style={guideStyles.li}><strong>Logic (xét từ trên xuống):</strong></li>
                <ol style={{paddingLeft: '20px'}}>
                    <li style={guideStyles.li}><strong>NẾU</strong> (ACOS trong 30 ngày qua &gt; 40% <strong>VÀ</strong> chi tiêu &gt; $16) <strong>THÌ</strong> giảm bid đi 20%.</li>
                    <li style={guideStyles.li}><strong>HOẶC NẾU</strong> (ACOS trong 14 ngày qua &gt; 25%) <strong>THÌ</strong> giảm bid đi 10%.</li>
                    <li style={guideStyles.li}><strong>HOẶC NẾU</strong> (ACOS trong 14 ngày qua &lt; 15% <strong>VÀ</strong> số đơn hàng &gt; 1) <strong>THÌ</strong> tăng bid lên 8%.</li>
                </ol>
            </ul>
            
            <h2 style={guideStyles.h2}>5. Tự động hóa Search Term: Từ Phòng thủ đến Tấn công</h2>
            <p style={guideStyles.p}>Tự động hóa search term không chỉ là về việc "phòng thủ" (phủ định từ khóa xấu) mà còn là về việc "tấn công" (tìm kiếm và mở rộng các cơ hội mới).</p>
            <h4 style={guideStyles.h4}>Ví dụ: Phủ định dựa trên Lượt nhấp không Chuyển đổi</h4>
            <p style={guideStyles.p}><strong>Tên Rule:</strong> <code style={guideStyles.code}>Phủ định không chuyển đổi</code></p>
            <p style={guideStyles.p}><strong>Chiến lược:</strong> Sử dụng công thức Ngưỡng Click. Giả sử CVR mục tiêu của chúng ta là 7%, ngưỡng click sẽ là <code style={guideStyles.code}>1 / 0.07 ≈ 14</code>.</p>
            <ul style={guideStyles.ul}>
                <li><strong>Logic:</strong></li>
                <ul style={{paddingLeft: '20px'}}>
                    <li><strong>NẾU</strong> (số lượt nhấp trong 30 ngày qua &gt; 14 <strong>VÀ</strong> số đơn hàng = 0) <strong>THÌ</strong> tạo một từ khóa phủ định cụm từ (Negative Phrase).</li>
                </ul>
            </ul>

            <h2 style={guideStyles.h2}>6. Tự động hóa Tăng tốc Ngân sách (Budget Acceleration)</h2>
            <p style={guideStyles.p}><strong>Mục tiêu:</strong> Tự động tăng ngân sách cho các chiến dịch đang hoạt động cực kỳ hiệu quả <strong>trong ngày</strong> để không bỏ lỡ doanh thu khi nhu cầu tăng đột biến. Ngân sách sẽ tự động được khôi phục về giá trị ban đầu vào cuối ngày.</p>
            <h4 style={guideStyles.h4}>Ví dụ: Rule "Tăng tốc khi ROAS cao"</h4>
            <p style={guideStyles.p}><strong>Tên Rule:</strong> <code style={guideStyles.code}>[SP-B] Tăng tốc khi ROAS cao</code></p>
            <ul style={guideStyles.ul}>
                <li style={guideStyles.li}><strong>Loại Rule:</strong> `Budget Acceleration`</li>
                <li style={guideStyles.li}><strong>Áp dụng cho:</strong> Chiến dịch Sản phẩm B (Ngân sách gốc $50/ngày)</li>
                <li style={guideStyles.li}><strong>Tần suất chạy:</strong> Mỗi 30 phút.</li>
                <li style={guideStyles.li}><strong>Logic:</strong>
                    <ul style={{paddingLeft: '20px'}}>
                        <li><strong>NẾU</strong> <code style={guideStyles.code}>ROAS (Today) &gt; 2.5</code> <strong>VÀ</strong> <code style={guideStyles.code}>Budget Utilization % (Today) &gt; 75%</code></li>
                        <li><strong>THÌ</strong> <code style={guideStyles.code}>Increase budget by 50%</code></li>
                    </ul>
                </li>
            </ul>
            <h4 style={guideStyles.h4}>Kịch bản</h4>
            <p style={guideStyles.p}>Vào lúc 3 giờ chiều, hệ thống chạy và thấy rằng chiến dịch đã tiêu <strong>$40 (80%)</strong> và tạo ra <strong>$120 doanh số (ROAS = 3.0)</strong>. Tất cả điều kiện được thỏa mãn. Hệ thống sẽ ghi lại ngân sách gốc $50 và tăng ngân sách của chiến dịch lên <strong>$75</strong>. Vào 11:55 PM, một quy trình riêng sẽ đặt lại ngân sách về <strong>$50</strong> cho ngày mai.</p>

            <h2 style={guideStyles.h2}>7. Tư duy Chiến lược Nâng cao - Khi ACoS không phải là tất cả</h2>
            <p style={guideStyles.p}>Các quy tắc dựa trên ACoS là cực kỳ mạnh mẽ để tối ưu hóa lợi nhuận. Tuy nhiên, việc chỉ tập trung vào ACoS có thể là một cái bẫy. Một nhà quảng cáo chuyên nghiệp luôn nhìn vào bức tranh lớn hơn.</p>
            <h3 style={guideStyles.h3}>7.1. TACOS (Total ACoS) - Chỉ số Sức khỏe Thực sự</h3>
            <ul style={guideStyles.ul}>
                <li style={guideStyles.li}><strong>ACoS:</strong> <code style={guideStyles.code}>Chi tiêu Quảng cáo / Doanh số từ Quảng cáo</code>. Đo lường hiệu quả của <strong>chỉ riêng quảng cáo</strong>.</li>
                <li style={guideStyles.li}><strong>TACOS:</strong> <code style={guideStyles.code}>Chi tiêu Quảng cáo / TỔNG Doanh số</code>. Đo lường <strong>tác động tổng thể</strong> của quảng cáo lên toàn bộ doanh nghiệp.</li>
            </ul>
            <p style={guideStyles.p}>Mục tiêu cuối cùng của quảng cáo là tạo ra "flywheel effect": quảng cáo thúc đẩy doanh số, tăng thứ hạng organic, từ đó dẫn đến nhiều doanh số organic hơn. Một chiến dịch tốt có thể có ACoS tăng nhẹ, nhưng lại kéo doanh số organic tăng mạnh, dẫn đến <strong>TACOS giảm</strong>. Đây là một dấu hiệu cực kỳ tốt.</p>
            
        </div>
    );
}