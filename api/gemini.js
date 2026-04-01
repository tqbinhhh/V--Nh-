import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { getGeminiConfig, getEnvValue } from './shared/env.js';
import { getPathname } from './shared/http.js';

const DEFAULT_SMART_INPUT_PROMPT = `Bạn là chuyên gia bóc tách dữ liệu tài chính. Hãy phân tích câu nói của người dùng và trả về DUY NHẤT một mã JSON theo cấu trúc:
{ "type": "INCOME" | "EXPENSE", "amount": number, "jar": "NEC"|"EDU"|"SAV"|"PLAY"|"LTSS"|"GIVE"|"ALL", "note": "string" }.
Quy tắc: 
Nếu là thu nhập (lương, thưởng, được cho): type là INCOME, jar là ALL.
Nếu là chi tiêu: type là EXPENSE, jar là hũ phù hợp nhất.
10k=10000, 1tr=1000000. Chỉ trả về JSON, không giải thích.`;

const DEFAULT_ADVISOR_PROMPT = `Bạn là cố vấn tài chính cá nhân của ứng dụng Ví Nhỏ. Người dùng đang tự nhập giao dịch thủ công.
Khi thấy giao dịch chi tiêu, hãy so sánh với số dư hũ và đưa ra cảnh báo nếu vượt mức.
Khi thấy thu nhập, hãy gợi ý cách phân bổ hũ tối ưu nhất dựa trên tình hình tài chính hiện tại.
Hãy đưa ra các nhận xét ngắn gọn, dí dỏm, mang phong cách của một người bạn đồng hành cùng Gen Z.`;

const DEFAULT_REPORTS_ASSISTANT_PROMPT = `Bạn là trợ lý AI cho trang Báo cáo & Phân tích của Ví Nhỏ Finance.
Bạn nhận dữ liệu báo cáo dạng JSON và một số câu hỏi của người dùng.
Nhiệm vụ:
- Nếu mode là "summary", hãy tạo bản tóm tắt báo cáo gồm headline, summary, alerts, reminders, suggestedQuestions, actionLabel và actionHref.
- Nếu mode là "chat", hãy trả lời câu hỏi của người dùng dựa trên context báo cáo và lịch sử hội thoại.
- Tuyệt đối không bịa số liệu ngoài context.
- Nếu dữ liệu chưa đủ, hãy nói rõ là chưa đủ dữ liệu thay vì đoán.
- Giọng điệu: tiếng Việt tự nhiên, ngắn gọn, thân thiện, thực tế.
- Ưu tiên câu chữ gọn để hiển thị đẹp trong thẻ nhỏ:
  - headline tối đa khoảng 10 từ
  - summary chỉ 1-2 câu, tránh lan man
  - alerts và reminders tối đa 3 mục mỗi loại
  - title của từng alert/reminder càng ngắn càng tốt
  - detail của từng alert/reminder chỉ 1 câu ngắn, đủ ý
  - reply khi chat nên ngắn gọn 2-4 câu
- actionHref chỉ nên là "/src/pages/dashboard.html" hoặc "/src/pages/multi_jar_budget_system.html" hoặc để trống.
Trả về DUY NHẤT JSON hợp lệ, không kèm markdown hay giải thích thêm.
Schema:
{
  "headline": "string",
  "summary": "string",
  "alerts": [{"tone":"danger|warning|info|success","title":"string","detail":"string"}],
  "reminders": [{"title":"string","detail":"string"}],
  "suggestedQuestions": ["string"],
  "actionLabel": "string",
  "actionHref": "string",
  "reply": "string"
}`;

const DEFAULT_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash-001'
];

function getGeminiModelCandidates(env) {
  const configuredModel = String(getEnvValue(env, 'VITE_GEMINI_MODEL') || getEnvValue(env, 'GEMINI_MODEL') || '').trim();
  const candidates = configuredModel ? [configuredModel, ...DEFAULT_GEMINI_MODELS] : DEFAULT_GEMINI_MODELS;
  return [...new Set(candidates.filter(Boolean))];
}

function isUnavailableModelError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const message = String(error?.message || '');
  return (
    status === 404 ||
    /404/i.test(message) ||
    /model .*not found/i.test(message) ||
    /not found for API version/i.test(message) ||
    /not supported for generateContent/i.test(message)
  );
}

async function generateWithFallback(genAI, modelNames, contents) {
  let lastError = null;

  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      return await model.generateContent(contents);
    } catch (error) {
      lastError = error;
      if (!isUnavailableModelError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Không thể gọi Gemini.');
}

function parseGeminiJson(text, fallbackMessage = 'Gemini trả về dữ liệu không hợp lệ.') {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        // fall through to the generic error below
      }
    }
  }

  throw new Error(fallbackMessage);
}

export function geminiApiPlugin(env) {
  const installMiddleware = (server) => {
    server.middlewares.use(async (req, res, next) => {
      if (getPathname(req.url) === '/api/gemini' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const { apiKey } = getGeminiConfig(env);
            if (!apiKey || apiKey === 'your_gemini_api_key_here') {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Gemini API Key missing in .env file' }));
              return;
            }

            // Architecture Check: JWT Validation
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
              res.statusCode = 401;
              res.end(JSON.stringify({ error: 'Unauthorized: Missing or invalid Bearer token' }));
              return;
            }
            const token = authHeader.replace('Bearer ', '').trim();
            const supabaseUrl = getEnvValue(env, 'VITE_SUPABASE_URL');
            const supabaseKey = getEnvValue(env, 'VITE_SUPABASE_ANON_KEY') || getEnvValue(env, 'VITE_SUPABASE_PUBLISHABLE_KEY');

            if (!supabaseUrl || !supabaseKey) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Server misconfigured: Missing Supabase URL or Key' }));
              return;
            }

            const supabase = createClient(supabaseUrl, supabaseKey);
            const { data: userData, error: authError } = await supabase.auth.getUser(token);
            
            if (authError || !userData?.user) {
              res.statusCode = 401;
              res.end(JSON.stringify({ error: 'Unauthorized: Token validation failed' }));
              return;
            }
            const userId = userData.user.id;

            const genAI = new GoogleGenerativeAI(apiKey);
            const modelCandidates = getGeminiModelCandidates(env);
            let result;

            const inferImageMimeType = (value = '') => {
              const match = String(value).match(/^data:([^;]+);base64,/i);
              return match ? match[1] : 'image/jpeg';
            };

            switch (data.action) {
                case 'smart-input': {
                  const systemPrompt = String(data.payload.systemPrompt || DEFAULT_SMART_INPUT_PROMPT).trim();
                  const prompt = `${systemPrompt}\n\nCâu nói của người dùng: "${String(data.payload.text || '').trim()}"`;
                  const response = await generateWithFallback(genAI, modelCandidates, prompt);
                  result = parseGeminiJson(response.response.text(), 'AI chưa trả về dữ liệu giao dịch hợp lệ.');
                  break;
                }
                case 'rebalance': {
                const prompt = `Bạn là chuyên gia tài chính "Ví Nhỏ Finance" theo hệ thống 6 cái Lọ. 
Số dư hiện tại của tôi: ${JSON.stringify(data.payload.balances)}.
Mục tiêu là đưa ra LỜI KHUYÊN (khoảng 3-4 câu, giọng điệu thân thiện, xưng "bạn", phong cách Gen Z, sử dụng tiếng Việt) nếu có 1 lọ thiết yếu sắp cạn nhưng lọ khác (như hưởng thụ) vẫn còn nhiều dư dả so với nhu cầu, thì đề xuất trích sang.
Trả về JSON định dạng: {"suggestion": "Lập luận của bạn"}. KHÔNG kèm text nào khác, không kèm markdown.`;
                  const response = await generateWithFallback(genAI, modelCandidates, prompt);
                  result = parseGeminiJson(response.response.text(), 'AI chưa trả về gợi ý cân bằng hợp lệ.');
                  break;
                }
                case 'predict': {
                const prompt = `Bạn là cố vấn tài chính. Hũ "${data.payload.jar}" hiện tại còn ${data.payload.balance} đồng. 
Dựa vào lịch sử tiêu dùng vài ngày qua, tốc độ tiêu thụ trung bình là ${data.payload.spendRate} đồng/ngày.
Dự báo hũ này sẽ hết vào khoảng bao nhiêu ngày nữa và viết LỜI CẢNH BÁO (ngắn, khoảng 2 câu, phong cách Gen Z).
Trả về JSON định dạng: {"warning": "câu cảnh báo"}. KHÔNG bọc markdown text.`;
                  const response = await generateWithFallback(genAI, modelCandidates, prompt);
                  result = parseGeminiJson(response.response.text(), 'AI chưa trả về cảnh báo dự báo hợp lệ.');
                  break;
                }
                case 'dashboard-insights': {
                const balances = data.payload.balances || {};
                const prompt = `Bạn là cố vấn tài chính thông minh "Ví Nhỏ Finance". 
Dưới đây là số dư hiện tại của các hũ: ${JSON.stringify(balances)}.
1. Rebalancing (Tái cân bằng): Có hũ nào đang cạn tiền (nhất là hũ "Chi phí thiết yếu") trong khi hũ khác (như "Giải trí", "Từ thiện") còn nhiều không? Gợi ý chuyển tiền ngắn gọn.
2. Predictive (Dự báo): Với các giao dịch gần đây (nếu có), chi tiêu có quá tay không? Hãy chọn ra 1 điểm đáng lưu ý nhất để cảnh báo hoặc khen ngợi.

YÊU CẦU: 
- Trả về đối tượng JSON: {"rebalanceSuggestion": "String", "predictiveWarning": "String"}
- Ngôn ngữ: Tiếng Việt, phong cách Gen Z (thân thiện, sử dụng từ lóng nhẹ nhàng như 'chill', 'ét ô ét', 'ổn áp', v.v. nếu phù hợp).
- KHÔNG kèm markdown, KHÔNG kèm text ngoài JSON.`;
                  const response = await generateWithFallback(genAI, modelCandidates, prompt);
                  result = parseGeminiJson(response.response.text(), 'AI chưa trả về nội dung phân tích hợp lệ.');
                  break;
                }
                case 'reports-assistant': {
                  const mode = String(data.payload.mode || 'summary').trim().toLowerCase();
                  const context = data.payload.context || {};
                  const messages = Array.isArray(data.payload.messages) ? data.payload.messages.slice(-8) : [];
                  const conversation = messages
                    .map((message) => `${String(message.role || 'user').toUpperCase()}: ${String(message.content || '').trim()}`)
                    .join('\n');

                  const prompt = `${DEFAULT_REPORTS_ASSISTANT_PROMPT}

Chế độ hiện tại: ${mode}

Ngữ cảnh báo cáo:
${JSON.stringify(context)}

Lịch sử hội thoại gần nhất:
${conversation || '(chưa có)'}

Yêu cầu bổ sung:
- Nếu mode là "summary", hãy ưu tiên headline/summary/alerts/reminders/suggestedQuestions/actionLabel/actionHref.
- Nếu mode là "chat", hãy ưu tiên reply, nhưng vẫn có thể bổ sung alerts/reminders nếu câu hỏi liên quan.
- Alerts và reminders chỉ nên có tối đa 3 mục mỗi loại.
- suggestedQuestions nên là các câu hỏi ngắn, thực tế để người dùng bấm nhanh.
- actionLabel nên là một hành động ngắn gọn như "Xem Dashboard" hoặc "Mở Hệ thống Hũ".
- actionHref nếu có thì chỉ dùng một trong hai đường dẫn được cho phép.`;

                  const response = await generateWithFallback(genAI, modelCandidates, prompt);
                  result = parseGeminiJson(response.response.text(), 'AI chưa trả về phân tích báo cáo hợp lệ.');
                  break;
                }
                case 'scan-receipt': {
                const imagePayload = String(data.payload.image || '');
                const base64Data = imagePayload.replace(/^data:[^;]+;base64,/, '');
                const mimeType = data.payload.mimeType || inferImageMimeType(imagePayload);
                const prompt = `Trích xuất thông tin từ biên lai này. 
Trả về JSON: {"storeName": "Tên cửa hàng", "totalAmount": number, "items": [{"amount": number, "category": "String", "note": "tên món hàng"}]}. 
Mã hũ (category): NEC (Thiết yếu), EDU (Giáo dục), SAV (Tiết kiệm), PLAY (Hưởng thụ), LTSS (Tiết kiệm dài hạn), GIVE (Cho đi).
Chỉ trả về JSON, không kèm bất kỳ text nào khác.`;
                  const response = await generateWithFallback(genAI, modelCandidates, [
                    { text: prompt },
                    { inlineData: { data: base64Data, mimeType } }
                  ]);
                  result = parseGeminiJson(response.response.text(), 'AI chưa trích xuất được dữ liệu hóa đơn hợp lệ.');
                break;
              }
              case 'advisor': {
                const systemPrompt = String(data.payload.systemPrompt || DEFAULT_ADVISOR_PROMPT).trim();
                const mode = String(data.payload.mode || 'transaction').trim().toLowerCase();
                const context = data.payload.context || {};

                  if (mode === 'summary') {
                    const prompt = `${systemPrompt}

Dữ liệu tuần/tháng của người dùng:
${JSON.stringify(context)}

Yêu cầu:
- Viết phân tích ngắn 3-4 câu về xu hướng chi tiêu.
- Đưa 1 gợi ý hành động cụ thể, dễ thực hiện.
- Ngôn ngữ tiếng Việt, tự nhiên, không giáo điều.
- Chỉ trả về JSON theo format: {"summary":"string","action":"string"}.`;
                    const response = await generateWithFallback(genAI, modelCandidates, prompt);
                    result = parseGeminiJson(response.response.text(), 'AI chưa trả về bản tóm tắt hợp lệ.');
                    break;
                  }

                const prompt = `${systemPrompt}

Bối cảnh giao dịch:
${JSON.stringify(context)}

Yêu cầu:
- Trả 1 nhận xét ngắn gọn 1-2 câu.
- Nếu có rủi ro thì cảnh báo rõ ràng.
- Nếu là thu nhập thì khuyến khích phân bổ hợp lý.
- Chỉ trả về JSON theo format: {"message":"string","riskLevel":"low|medium|high"}.`;
                  const response = await generateWithFallback(genAI, modelCandidates, prompt);
                  result = parseGeminiJson(response.response.text(), 'AI chưa trả về nhận xét giao dịch hợp lệ.');
                  break;
                }
              default:
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: 'Invalid action' }));
            }

            // Architecture Check: Save activity to ai_logs Table securely
            try {
                const safePayload = { ...data.payload };
                if (safePayload.image) safePayload.image = '[BASE64_IMAGE_OMITTED]'; // prevent huge blob logging
                
                await supabase.from('ai_logs').insert({
                    user_id: userId,
                    input_data: safePayload,
                    result_data: result,
                    status: 'success'
                });
            } catch (logErr) {
                console.error('Telemtry log to ai_logs failed:', logErr);
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch(e) {
            console.error('Gemini API Error:', e);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      } else {
        next();
      }
    });
  };

  return {
    name: 'gemini-api',
    configureServer(server) {
      installMiddleware(server);
    },
    configurePreviewServer(server) {
      installMiddleware(server);
    }
  };
}
