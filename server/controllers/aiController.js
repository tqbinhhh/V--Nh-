const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { fetch: fetch },
    auth: { persistSession: false },
    realtime: {
        transport: WebSocket
    }
});

const DEFAULT_SMART_INPUT_PROMPT = `Bạn là chuyên gia bóc tách dữ liệu tài chính. Hãy phân tích câu nói của người dùng và trả về DUY NHẤT một mã JSON theo cấu trúc:
{ "type": "INCOME" | "EXPENSE", "amount": number, "jar": "NEC"|"EDU"|"SAV"|"PLAY"|"LTSS"|"GIVE"|"ALL", "note": "string" }.
Quy tắc: 
Nếu là thu nhập (lương, thưởng, được cho): type là INCOME, jar là ALL.
Nếu là chi tiêu: type là EXPENSE, jar là hũ phù hợp nhất.
10k=10000, 1tr=1000000. Chỉ trả về JSON, không giải thích.`;

const DEFAULT_ADVISOR_PROMPT = `Bạn là cố vấn tài chính cá nhân của ứng dụng Ví Nhỏ.
Khi thấy giao dịch chi tiêu, hãy so sánh với số dư hũ và đưa ra cảnh báo.
Khi thấy thu nhập, hãy gợi ý cách phân bổ hũ tối ưu nhất.
Hãy đưa ra nhận xét ngắn gọn, dí dỏm, phong cách Gen Z.`;

const parseGeminiJson = (text) => {
    const cleaned = String(text || '').replace(/```json|```/g, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        const objectMatch = cleaned.match(/\{[\s\S]*\}/);
        if (objectMatch?.[0]) return JSON.parse(objectMatch[0]);
    }
    throw new Error('Gemini trả về dữ liệu không hợp lệ.');
};

exports.handleGeminiAction = async (req, res) => {
    try {
        const data = req.body;
        const token = req.token; // từ authMiddleware

        // Verify user with Supabase
        const { data: userData, error: authError } = await supabase.auth.getUser(token);
        if (authError || !userData?.user) {
            return res.status(401).json({ error: 'Unauthorized: Token validation failed' });
        }
        const userId = userData.user.id;

        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        let result;

        switch (data.action) {
            case 'smart-input': {
                const prompt = `${DEFAULT_SMART_INPUT_PROMPT}\n\nCâu nói của người dùng: "${data.payload.text}"`;
                const response = await model.generateContent(prompt);
                result = parseGeminiJson(response.response.text());
                break;
            }
            case 'dashboard-insights': {
                const balances = data.payload.balances || {};
                const prompt = `Bạn là cố vấn tài chính thông minh "Ví Nhỏ Finance". 
Dưới đây là số dư hiện tại của các hũ: ${JSON.stringify(balances)}.
1. Rebalancing: Có hũ nào đang cạn tiền trong khi hũ khác còn nhiều không? Gợi ý chuyển tiền.
2. Predictive: Đưa ra lời khuyên hoặc cảnh báo chi tiêu.
Trả về JSON: {"rebalanceSuggestion": "String", "predictiveWarning": "String"}`;
                const response = await model.generateContent(prompt);
                result = parseGeminiJson(response.response.text());
                break;
            }
            case 'advisor': {
                const mode = data.payload.mode || 'transaction';
                const context = data.payload.context || {};
                if (mode === 'summary') {
                    const prompt = `${DEFAULT_ADVISOR_PROMPT}\nDữ liệu tuần/tháng: ${JSON.stringify(context)}\nChỉ trả về JSON: {"summary":"string","action":"string"}`;
                    const response = await model.generateContent(prompt);
                    result = parseGeminiJson(response.response.text());
                } else {
                    const prompt = `${DEFAULT_ADVISOR_PROMPT}\nBối cảnh giao dịch: ${JSON.stringify(context)}\nChỉ trả về JSON: {"message":"string","riskLevel":"low|medium|high"}`;
                    const response = await model.generateContent(prompt);
                    result = parseGeminiJson(response.response.text());
                }
                break;
            }
            case 'rebalance': {
                const prompt = `Bạn là chuyên gia tài chính "Ví Nhỏ Finance" theo hệ thống 6 cái Lọ. 
Số dư hiện tại của tôi: ${JSON.stringify(data.payload.balances)}.
Mục tiêu là đưa ra LỜI KHUYÊN (khoảng 3-4 câu) nếu có 1 lọ thiết yếu sắp cạn nhưng lọ khác còn dư, thì đề xuất trích sang.
Trả về JSON định dạng: {"suggestion": "Lập luận của bạn"}. KHÔNG kèm text nào khác.`;
                const response = await model.generateContent(prompt);
                result = parseGeminiJson(response.response.text());
                break;
            }
            case 'predict': {
                const prompt = `Bạn là cố vấn tài chính. Hũ "${data.payload.jar}" hiện tại còn ${data.payload.balance} đồng. 
Tốc độ tiêu thụ trung bình là ${data.payload.spendRate} đồng/ngày.
Dự báo hũ này sẽ hết vào khoảng bao nhiêu ngày nữa và viết LỜI CẢNH BÁO.
Trả về JSON định dạng: {"warning": "câu cảnh báo"}.`;
                const response = await model.generateContent(prompt);
                result = parseGeminiJson(response.response.text());
                break;
            }
            case 'reports-assistant': {
                const mode = data.payload.mode || 'summary';
                let prompt = `Bạn là trợ lý AI cho ứng dụng quản lý chi tiêu cá nhân "Ví Nhỏ". Dữ liệu của người dùng: ${JSON.stringify(data.payload.context)}\n`;
                if (mode === 'chat') {
                    prompt += `Lịch sử chat: ${JSON.stringify(data.payload.messages)}\n`;
                    prompt += `Dựa vào dữ liệu và lịch sử chat, hãy trả lời câu hỏi mới nhất của người dùng một cách ngắn gọn, súc tích, và thân thiện. Trả về DUY NHẤT JSON theo định dạng: {"reply": "câu trả lời của bạn"}`;
                } else {
                    prompt += `Trả về DUY NHẤT JSON theo định dạng: {"headline": "string", "summary": "string", "alerts": [], "reminders": [], "suggestedQuestions": [], "actionLabel": "string", "actionHref": "string"}`;
                }
                const response = await model.generateContent(prompt);
                result = parseGeminiJson(response.response.text());
                break;
            }
            case 'scan-receipt': {
                const prompt = `Trích xuất thông tin từ biên lai này. 
Trả về JSON: {"storeName": "Tên cửa hàng", "totalAmount": number, "items": [{"amount": number, "category": "String", "note": "tên món hàng"}]}.`;
                const imageParts = [
                    {
                        inlineData: {
                            data: data.payload.image.replace(/^data:[^;]+;base64,/, ''),
                            mimeType: data.payload.mimeType || 'image/jpeg'
                        }
                    }
                ];
                const response = await model.generateContent([prompt, ...imageParts]);
                result = parseGeminiJson(response.response.text());
                break;
            }
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
        try {
            await supabase.from('ai_logs').insert({
                user_id: userId,
                input_data: data.payload,
                result_data: result,
                status: 'success'
            });
        } catch (e) {
            console.error('Lỗi khi lưu log AI:', e);
        }

        res.json(result);
    } catch (e) {
        console.error('AI Error:', e);
        
        const errorMessage = String(e.message || '');
        if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('Too Many Requests')) {
            return res.status(429).json({ 
                error: 'AI đang bận xử lý. Bạn đã đạt giới hạn miễn phí tạm thời, vui lòng đợi khoảng 1 phút rồi thử lại nhé!' 
            });
        }
        
        res.status(500).json({ error: e.message });
    }
};
