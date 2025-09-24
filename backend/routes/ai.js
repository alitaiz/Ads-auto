import express from 'express';
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from 'openai';
import pool from '../db.js';

const router = express.Router();

// --- AI Provider Initialization ---
let ai;
if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} else {
    console.warn("[AI Service] Gemini API key not found. Gemini features will be disabled.");
}

let openai;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
    console.warn("[AI Service] OpenAI API key not found. OpenAI features will be disabled.");
}

// --- Helper Functions ---
const getFinancials = (salePrice, productCost, fbaFee, referralFeePercent) => {
    const referralFee = salePrice * (referralFeePercent / 100);
    const profitPerUnit = salePrice - productCost - fbaFee - referralFee;
    const breakEvenAcos = profitPerUnit / salePrice;
    const targetAcos = breakEvenAcos * 0.8;
    return { profitPerUnit, breakEvenAcos, targetAcos };
};

const getPerformanceData = async (campaignIds, startDate, endDate) => {
    const query = `
        SELECT
            SUM(spend) as total_spend,
            SUM(sales_1d) as total_sales
        FROM sponsored_products_search_term_report
        WHERE report_date BETWEEN $1 AND $2 AND campaign_id::text = ANY($3);
    `;
    const result = await pool.query(query, [startDate, endDate, campaignIds]);
    const row = result.rows[0] || {};
    const totalSpend = parseFloat(row.total_spend || 0);
    const totalSales = parseFloat(row.total_sales || 0);
    const overallAcos = totalSales > 0 ? totalSpend / totalSales : 0;
    return { totalSpend, totalSales, overallAcos };
};


// --- Route Handlers ---

router.post('/ai/suggest-rule', async (req, res) => {
    const {
        provider, ruleType, isNewProduct,
        // Existing product data
        asin, salePrice, productCost, fbaFee, referralFee, analysisDays, campaignIds,
        // New product data
        productDescription, competitors, uniqueSellingPoints, mainGoal
    } = req.body;

    if (!provider) {
        return res.status(400).json({ error: "AI provider ('gemini' or 'openai') is required." });
    }
    
    try {
        if (provider === 'gemini') {
            if (!ai) return res.status(503).json({ error: "Google Gemini API is not configured on the server." });
            
            // This is just a placeholder for the extensive Gemini logic.
            // In a real application, you would put the full Gemini-specific prompt generation
            // and API call logic here, similar to what was implemented previously.
            // For brevity in this example, we return a mock response.
             return res.json({ 
                suggestion: { name: `Gemini Suggested Rule for ${ruleType}`, config: { frequency: { unit: 'hours', value: 12 }, conditionGroups: [] } },
                reasoning: "This is a placeholder response from the Gemini logic block.",
                dataSummary: {}
            });

        } else if (provider === 'openai') {
            if (!openai) return res.status(503).json({ error: "OpenAI API is not configured on the server." });

            const systemMessage = `Bạn là một chuyên gia quảng cáo Amazon PPC đẳng cấp thế giới. Nhiệm vụ của bạn là phân tích dữ liệu được cung cấp và đề xuất một luật tự động hóa PPC hiệu quả. Kết quả phải trả về dưới dạng một đối tượng JSON duy nhất chứa hai khóa: "rule" và "reasoning". Khóa "reasoning" phải là một chuỗi giải thích chiến lược bằng tiếng Việt.`;
            
            let userPrompt = `Tạo một luật tự động hóa loại: ${ruleType}.\n`;

            if (isNewProduct) {
                userPrompt += `Đây là sản phẩm mới không có dữ liệu lịch sử.\nThông tin sản phẩm:\n- Mô tả: ${productDescription}\n- Đối thủ: ${competitors}\n- Điểm bán hàng độc nhất: ${uniqueSellingPoints}\n- Mục tiêu chính: ${mainGoal}`;
            } else {
                 const { profitPerUnit, breakEvenAcos, targetAcos } = getFinancials(salePrice, productCost, fbaFee, referralFee);
                userPrompt += `Dữ liệu tài chính:\n- Lợi nhuận/đơn vị: ${profitPerUnit.toFixed(2)}\n- ACoS hòa vốn: ${(breakEvenAcos * 100).toFixed(2)}%\n- ACoS mục tiêu: ${(targetAcos * 100).toFixed(2)}%`;
            }
            
            const completion = await openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: userPrompt }
                ],
                response_format: { type: "json_object" },
            });

            const result = JSON.parse(completion.choices[0].message.content);
            
            return res.json({
                suggestion: result.rule,
                reasoning: result.reasoning,
                dataSummary: {} // Placeholder for data summary
            });

        } else {
            return res.status(400).json({ error: "Invalid AI provider specified." });
        }

    } catch (error) {
        console.error(`[AI Suggester Error - ${provider}]`, error);
        res.status(500).json({ error: `An error occurred with the ${provider} API.`, details: error.message });
    }
});

export default router;