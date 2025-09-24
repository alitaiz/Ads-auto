// backend/routes/ai.js
import express from 'express';
import pool from '../db.js';
import { GoogleGenAI, Type } from '@google/genai';

const router = express.Router();
// Ensure GEMINI_API_KEY is used from environment variables
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Endpoint to suggest a PPC rule based on product data or a launch plan for a new product
router.post('/ai/suggest-rule', async (req, res) => {
    const { isNewProduct, productData, ruleType, dateRange } = req.body;

    try {
        if (isNewProduct) {
            // --- Logic for New Product ---
            const result = await getNewProductLaunchPlan(productData);
            res.json(result);
        } else {
            // --- Logic for Existing Product ---
            const result = await getExistingProductRule(productData, ruleType, dateRange);
            res.json(result);
        }
    } catch (error) {
        console.error('[AI Suggester] Error:', error);
        res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
});

// --- Function for NEW PRODUCT Launch Plan ---
const getNewProductLaunchPlan = async (productData) => {
    const { description, competitors, usp, goal } = productData;
    
    const prompt = `
        BẠN LÀ MỘT CHUYÊN GIA VỀ AMAZON PPC. Nhiệm vụ của bạn là tạo ra một "Kế hoạch Khởi chạy PPC" (PPC Launch Playbook) chi tiết cho một sản phẩm mới dựa trên thông tin được cung cấp. Cung cấp kết quả dưới dạng JSON hợp lệ và một lời giải thích chiến lược bằng tiếng Việt.

        Thông tin sản phẩm:
        - Mô tả: ${description}
        - Đối thủ cạnh tranh chính: ${competitors}
        - Điểm bán hàng độc nhất (USP): ${usp}
        - Mục tiêu chiến dịch: ${goal}

        Dựa vào thông tin trên, hãy tạo ra:
        1.  **suggestedKeywords**: Một danh sách các từ khóa khởi đầu, được phân loại thành 'core' (chính) và 'long_tail' (đuôi dài).
        2.  **suggestedCampaigns**: Đề xuất cấu trúc chiến dịch, bao gồm ít nhất một chiến dịch Tự động (Auto) và một chiến dịch Thủ công (Manual).
        3.  **suggestedRules**: Đề xuất 2 quy tắc tự động hóa ban đầu.
            - Một quy tắc "phòng thủ" loại 'SEARCH_TERM_AUTOMATION' để phủ định các search term không hiệu quả.
            - Một quy tắc "tấn công" gợi ý logic để "tốt nghiệp" các search term tốt từ chiến dịch Auto sang Manual.
        4.  **reasoning**: Giải thích ngắn gọn về chiến lược đằng sau các đề xuất của bạn bằng tiếng Việt.
    `;

    const schema = {
        type: Type.OBJECT,
        properties: {
            suggestedKeywords: {
                type: Type.OBJECT,
                properties: {
                    core: { type: Type.ARRAY, items: { type: Type.STRING } },
                    long_tail: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
            },
            suggestedCampaigns: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: { name: { type: Type.STRING }, type: { type: Type.STRING }, purpose: { type: Type.STRING } }
                }
            },
            suggestedRules: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: { name: { type: Type.STRING }, logic: { type: Type.STRING }, reasoning: { type: Type.STRING } }
                }
            },
            reasoning: { type: Type.STRING }
        },
        required: ["suggestedKeywords", "suggestedCampaigns", "suggestedRules", "reasoning"]
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: schema },
    });

    const result = JSON.parse(response.text);
    return { type: 'playbook', playbook: result };
};

// --- Function for EXISTING PRODUCT Rule Suggestion ---
const getExistingProductRule = async (productData, ruleType, dateRange) => {
    const { asin, salePrice, productCost, fbaFee, referralFeePercent } = productData;

    // 1. Calculate financial metrics
    const referralFee = salePrice * (referralFeePercent / 100);
    const profitPerUnit = salePrice - productCost - fbaFee - referralFee;
    const breakEvenAcos = profitPerUnit > 0 ? (profitPerUnit / salePrice) * 100 : 0;
    const targetAcos = breakEvenAcos * 0.8; // Aim for 20% profit margin

    // 2. Fetch data from DB
    // First, get historical data and associated campaign IDs
    const historicalQuery = `
        SELECT
            campaign_id,
            SUM(spend) as total_spend,
            SUM(sales_7d) as total_sales
        FROM sponsored_products_search_term_report
        WHERE asin = $1 AND report_date BETWEEN $2 AND $3
        GROUP BY campaign_id;
    `;
    const historicalResult = await pool.query(historicalQuery, [asin, dateRange.start, dateRange.end]);
    const campaignIds = historicalResult.rows.map(r => r.campaign_id.toString());

    if (campaignIds.length === 0) {
        return {
            type: 'rule',
            rule: null,
            reasoning: "Không tìm thấy dữ liệu quảng cáo nào cho ASIN này trong khoảng thời gian đã chọn. Không thể tạo đề xuất.",
            dataSummary: { financial: { profitPerUnit, breakEvenAcos, targetAcos }, performance: {} }
        };
    }

    // Second, use campaign IDs to get stream data
    const streamQuery = `
        WITH traffic AS (
            SELECT SUM((event_data->>'cost')::numeric) AS spend FROM raw_stream_events
            WHERE event_type = 'sp-traffic' AND (event_data->>'campaign_id') = ANY($1)
            AND (event_data->>'time_window_start')::timestamptz BETWEEN $2 AND $3
        ),
        conversion AS (
            SELECT SUM((event_data->>'attributed_sales_1d')::numeric) AS sales FROM raw_stream_events
            WHERE event_type = 'sp-conversion' AND (event_data->>'campaign_id') = ANY($1)
            AND (event_data->>'time_window_start')::timestamptz BETWEEN $2 AND $3
        )
        SELECT (SELECT spend FROM traffic) as stream_spend, (SELECT sales FROM conversion) as stream_sales;
    `;
    const streamResult = await pool.query(streamQuery, [campaignIds, dateRange.start, dateRange.end]);

    // 3. Aggregate data
    const totalSpend = (historicalResult.rows.reduce((sum, r) => sum + parseFloat(r.total_spend), 0)) + (parseFloat(streamResult.rows[0]?.stream_spend) || 0);
    const totalSales = (historicalResult.rows.reduce((sum, r) => sum + parseFloat(r.total_sales), 0)) + (parseFloat(streamResult.rows[0]?.stream_sales) || 0);
    const overallAcos = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0;

    const dataSummary = {
        financial: { profitPerUnit, breakEvenAcos, targetAcos },
        performance: { totalSpend, totalSales, overallAcos, campaignIds }
    };

    // 4. Build Prompt for Gemini
    const prompt = buildPromptForRuleType(ruleType, dataSummary);
    const schema = getSchemaForRuleType(ruleType);

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: schema },
    });

    const result = JSON.parse(response.text);

    return { type: 'rule', rule: result.rule, reasoning: result.reasoning, dataSummary };
};

const buildPromptForRuleType = (ruleType, dataSummary) => {
    const { financial, performance } = dataSummary;
    const basePrompt = `
        BẠN LÀ MỘT TRỢ LÝ AI CHUYÊN GIA VỀ TỐI ƯU HÓA AMAZON PPC.
        Nhiệm vụ của bạn là phân tích dữ liệu được cung cấp và đề xuất một luật tự động hóa PPC hiệu quả bằng tiếng Việt.
        Cung cấp kết quả dưới dạng JSON hợp lệ, bao gồm 'rule' và 'reasoning'.

        LƯU Ý QUAN TRỌNG VỀ LOGIC: Hệ thống xử lý các Nhóm Điều kiện (conditionGroups) theo thứ tự từ trên xuống dưới ("First Match Wins"). Ngay khi một thực thể khớp với TẤT CẢ các điều kiện trong một nhóm, hành động của nhóm đó sẽ được thực thi và hệ thống sẽ NGỪNG xử lý. Vì vậy, hãy đặt các điều kiện cụ thể nhất hoặc mang tính "cắt lỗ" (ví dụ: giảm bid mạnh) lên trên cùng.

        Dữ liệu phân tích:
        - Chỉ số Tài chính:
          - Lợi nhuận mỗi đơn vị: $${financial.profitPerUnit.toFixed(2)}
          - ACoS Hòa vốn: ${financial.breakEvenAcos.toFixed(2)}%
          - ACoS Mục tiêu: ${financial.targetAcos.toFixed(2)}%
        - Hiệu suất Tổng thể:
          - Tổng chi tiêu: $${performance.totalSpend.toFixed(2)}
          - Tổng doanh số: $${performance.totalSales.toFixed(2)}
          - ACoS Tổng thể: ${performance.overallAcos.toFixed(2)}%
    `;

    switch (ruleType) {
        case 'BID_ADJUSTMENT':
            return `${basePrompt}
            Yêu cầu: Đề xuất một luật "BID_ADJUSTMENT" (Điều chỉnh Bid) đa tầng. Hãy tạo các nhóm điều kiện để:
            1.  Giảm bid mạnh cho các từ khóa/mục tiêu có ACoS rất cao, vượt xa mức hòa vốn.
            2.  Giảm bid nhẹ cho các từ khóa/mục tiêu có ACoS cao hơn mức mục tiêu.
            3.  Tăng bid nhẹ cho các từ khóa/mục tiêu có ACoS thấp và có lợi nhuận.
            Sử dụng khoảng thời gian phân tích (timeWindow) là 30 hoặc 60 ngày.
            `;
        case 'SEARCH_TERM_AUTOMATION':
            return `${basePrompt}
            Yêu cầu: Đề xuất một luật "SEARCH_TERM_AUTOMATION" (Quản lý Search Term). Hãy tạo một nhóm điều kiện để tự động phủ định (negate) các search term lãng phí chi tiêu mà không tạo ra doanh số. Sử dụng khoảng thời gian phân tích (timeWindow) là 60 ngày.
            `;
        case 'BUDGET_ACCELERATION':
            return `${basePrompt}
            Yêu cầu: Đề xuất một luật "BUDGET_ACCELERATION" (Tăng tốc Ngân sách). Hãy tạo một nhóm điều kiện để tăng ngân sách trong ngày khi hiệu suất rất tốt (ví dụ ROAS cao) và ngân sách đã được sử dụng gần hết. TimeWindow cho các chỉ số này phải là "TODAY".
            `;
        default:
            return basePrompt;
    }
};

const getSchemaForRuleType = (ruleType) => {
    // Shared schema components
    const conditionSchema = {
        type: Type.OBJECT, properties: {
            metric: { type: Type.STRING }, timeWindow: { type: Type.ANY }, operator: { type: Type.STRING }, value: { type: Type.NUMBER }
        }
    };
    const actionSchema = {
        type: Type.OBJECT, properties: {
            type: { type: Type.STRING }, value: { type: Type.NUMBER }, matchType: { type: Type.STRING }
        }
    };
    const conditionGroupSchema = {
        type: Type.OBJECT, properties: {
            conditions: { type: Type.ARRAY, items: conditionSchema }, action: actionSchema
        }
    };

    const ruleSchema = {
        type: Type.OBJECT, properties: {
            name: { type: Type.STRING }, rule_type: { type: Type.STRING }, ad_type: { type: Type.STRING },
            config: {
                type: Type.OBJECT, properties: {
                    conditionGroups: { type: Type.ARRAY, items: conditionGroupSchema },
                    frequency: { type: Type.OBJECT, properties: { unit: { type: Type.STRING }, value: { type: Type.NUMBER } } },
                    cooldown: { type: Type.OBJECT, properties: { unit: { type: Type.STRING }, value: { type: Type.NUMBER } } }
                }
            }
        }
    };

    return {
        type: Type.OBJECT,
        properties: {
            rule: ruleSchema,
            reasoning: { type: Type.STRING, description: "Giải thích bằng tiếng Việt về lý do đề xuất luật này." }
        },
        required: ["rule", "reasoning"]
    };
};

export default router;
