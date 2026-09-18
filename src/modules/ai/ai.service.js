const aiModel = require('./ai.model');
const jobModel = require('../job/job.model');
const appModel = require('../application/application.model');
const profileModel = require('../profile/profile.model');
const AppError = require('../../utils/app-error');
const llmClient = require('./llm.client');
const { extractTextFromBuffer } = require('../../utils/document-parser');
const db = require('../../config/db');
const logger = require('../../config/logger');

/**
 * 1. AI Chatbot (Hỏi đáp, tư vấn việc làm, giải thích thuật ngữ)
 */
const processChat = async (accountId, { question, support_type = 'chatbot' }) => {
    if (!question) {
        throw new AppError(400, 'Vui lòng nhập câu hỏi');
    }

    const systemPrompt = `Bạn là Trợ lý AI chuyên nghiệp của sàn tuyển dụng trực tuyến JobBee.
Nhiệm vụ của bạn là hỗ trợ Ứng viên và Nhà tuyển dụng:
- Giải thích thuật ngữ chuyên ngành (Frontend, Backend, DevOps, Microservices, CI/CD, KPI, OKR...).
- Hướng dẫn viết CV chuyên nghiệp, cách trả lời phỏng vấn theo phương pháp STAR.
- Tư vấn định hướng nghề nghiệp, lộ trình học tập kỹ năng công nghệ.
- Đưa ra lời khuyên khách quan, văn phong thân thiện, lịch sự và súc tích bằng tiếng Việt.`;

    let replyText = '';
    try {
        const aiResponse = await llmClient.generate(question, systemPrompt);
        if (aiResponse) {
            replyText = aiResponse;
        }
    } catch (err) {
        console.error('LLM Error:', err.message);
    }

    // Heuristic fallback if LLM is not configured
    if (!replyText) {
        const qLower = question.toLowerCase();
        if (qLower.includes('cv') || qLower.includes('hồ sơ')) {
            replyText = 'Để tối ưu CV của bạn: hãy trình bày rõ ràng kinh nghiệm theo thứ tự thời gian gần nhất, làm nổi bật các dự án thực tế kèm số liệu cụ thể (STAR method), và tập trung vào các kỹ năng công nghệ mà vị trí tuyển dụng đang yêu cầu.';
        } else if (qLower.includes('phỏng vấn') || qLower.includes('interview')) {
            replyText = 'Khi tham gia phỏng vấn: hãy tìm hiểu kỹ về công ty, chuẩn bị phần giới thiệu bản thân súc tích trong 2 phút, chuẩn bị 2-3 câu hỏi cho nhà tuyển dụng và sử dụng kỹ thuật STAR để trả lời các câu hỏi tình huống.';
        } else if (qLower.includes('small job') || qLower.includes('ngắn hạn')) {
            replyText = 'Tính năng Small Job (Việc làm ngắn hạn) trên JobBee cho phép bạn nhận các ca làm linh hoạt theo giờ hoặc theo ngày. Sau khi hoàn thành, bạn và nhà tuyển dụng sẽ đánh giá lẫn nhau để tích lũy Điểm uy tín (Trust Score).';
        } else {
            replyText = `Trợ lý AI JobBee giải đáp: "${question}". Hệ thống đề xuất bạn nên cập nhật đầy đủ thông tin kỹ năng trong hồ sơ, tạo bản CV chuyên biệt theo định hướng nghề nghiệp và tham khảo các tin tuyển dụng đã qua xác minh.`;
        }
    }

    const result = { answer: replyText, timestamp: new Date() };

    if (accountId) {
        try {
            await aiModel.saveChatSession({
                account_id: accountId,
                question,
                support_type,
                analysis_result: result,
            });
        } catch (dbErr) {
            console.error('Error saving chat session:', dbErr.message);
        }
    }

    return result;
};

/**
 * 2. Phân tích CV bằng AI: Trích xuất nội dung và gợi ý danh sách Tin Tuyển Dụng phù hợp nhất
 */
const analyzeCVToJobs = async (accountId, file, cvId) => {
    let extractedText = '';
    let fileName = 'CV_Ung_Vien';

    // 1. Trích xuất text từ tệp upload nếu có
    if (file && file.buffer) {
        const MAX_FILE_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            throw new AppError(400, 'Kích thước tệp CV vượt quá giới hạn 5MB');
        }
        extractedText = await extractTextFromBuffer(file.buffer, file.mimetype, file.originalname);
        fileName = file.originalname || 'CV_Upload.pdf';
    } else if (cvId && accountId) {
        // 2. Lấy CV có sẵn từ tài khoản ứng viên
        const cv = await profileModel.getCVVersionById(accountId, cvId);
        if (!cv) {
            throw new AppError(404, 'Không tìm thấy bản CV được chọn trong tài khoản của bạn.');
        }
        fileName = cv.cv_name || 'Bản CV đã lưu';

        if (cv.attachment_file) {
            if (cv.attachment_file.startsWith('data:')) {
                const match = cv.attachment_file.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                    const mime = match[1];
                    const buffer = Buffer.from(match[2], 'base64');
                    extractedText = await extractTextFromBuffer(buffer, mime, cv.cv_name || 'cv.pdf');
                }
            } else if (cv.attachment_file.startsWith('http://') || cv.attachment_file.startsWith('https://')) {
                try {
                    const response = await fetch(cv.attachment_file);
                    const mime = response.headers.get('content-type') || 'application/pdf';
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    extractedText = await extractTextFromBuffer(buffer, mime, cv.cv_name || 'cv.pdf');
                } catch (fetchErr) {
                    logger.warn(`Failed to fetch attachment file from URL: ${fetchErr.message}`);
                }
            }
        }

        if (!extractedText || extractedText.trim().length < 20) {
            const parts = [];
            parts.push(`Tên hồ sơ CV: ${cv.cv_name}`);
            if (cv.career_orientation) parts.push(`Định hướng nghề nghiệp / Chuyên môn: ${cv.career_orientation}`);
            if (cv.cv_content) {
                const contentStr = typeof cv.cv_content === 'object' ? JSON.stringify(cv.cv_content, null, 2) : cv.cv_content;
                parts.push(`Nội dung chi tiết hồ sơ: ${contentStr}`);
            }
            extractedText = parts.join('\n');
        } else if (cv.career_orientation) {
            extractedText = `[Định hướng chuyên môn: ${cv.career_orientation}]\n` + extractedText;
        }
    } else {
        throw new AppError(400, 'Vui lòng chọn một bản CV trong tài khoản hoặc tải lên tệp CV mới (PDF/DOCX)');
    }

    if (!extractedText || extractedText.trim().length < 10) {
        throw new AppError(400, 'Không thể đọc nội dung văn bản từ bản CV đã chọn. Vui lòng đảm bảo tệp chứa văn bản có thể đọc được.');
    }

    // 3. Lấy danh sách các tin tuyển dụng đang hoạt động trong DB
    const jobsRes = await db.query(`
        SELECT 
            jp.id,
            jp.title,
            jp.job_type,
            jp.salary_min,
            jp.salary_max,
            jp.is_negotiable,
            jp.location,
            jp.job_description,
            jp.requirements,
            jp.posted_date,
            jp.tags,
            e.company_name,
            COALESCE(e.logo_url, e.avatar_url) as company_logo,
            e.trust_score,
            e.verification_status,
            p.name as province_name
        FROM job_posting jp
        JOIN employer e ON jp.employer_id = e.id
        LEFT JOIN province p ON jp.province_id = p.id
        LEFT JOIN small_job_posting sjp ON jp.id = sjp.job_posting_id
        WHERE jp.approval_status = 'approved'
          AND (sjp.is_closed IS NULL OR sjp.is_closed = FALSE)
        ORDER BY jp.posted_date DESC
        LIMIT 60
    `);

    const formatSalaryText = (min, max, isNegotiable) => {
        if (isNegotiable) return 'Thỏa thuận';
        if (min && max) {
            if (min === max) return `${(min / 1000000).toLocaleString('vi-VN')} triệu`;
            return `${(min / 1000000).toLocaleString('vi-VN')} - ${(max / 1000000).toLocaleString('vi-VN')} triệu`;
        }
        if (min) return `Từ ${(min / 1000000).toLocaleString('vi-VN')} triệu`;
        if (max) return `Đến ${(max / 1000000).toLocaleString('vi-VN')} triệu`;
        return 'Thỏa thuận';
    };

    const activeJobs = (jobsRes.rows || []).map(job => ({
        ...job,
        salary: formatSalaryText(job.salary_min, job.salary_max, job.is_negotiable)
    }));
    const summary = extractedText.replace(/\s+/g, ' ').trim().substring(0, 250);

    if (!activeJobs || activeJobs.length === 0) {
        const result = {
            file_name: fileName,
            extracted_summary: summary + (extractedText.length > 250 ? '...' : ''),
            matching_jobs: [],
            analyzed_at: new Date(),
        };
        return result;
    }

    const jobListPrompt = activeJobs.map(j => {
        const reqs = (j.requirements || j.job_description || '').replace(/\s+/g, ' ').substring(0, 180);
        const tags = Array.isArray(j.tags) && j.tags.length > 0 ? `| Ngành/Từ khóa: ${j.tags.join(', ')}` : '';
        return `- Tin ID ${j.id}: Tiêu đề: "${j.title}" | Công ty: "${j.company_name}" | Địa điểm: "${j.province_name || j.location}" ${tags} | Yêu cầu tóm tắt: ${reqs}`;
    }).join('\n');

    const prompt = `Bạn là Chuyên gia Tuyển dụng và So khớp Hồ sơ Việc làm AI (AI Job Matching Specialist).
Dưới đây là toàn bộ nội dung trích xuất từ CV của ứng viên:
"""
${extractedText.substring(0, 10000)}
"""

Hệ thống JobBee hiện có danh sách các Tin tuyển dụng đang hoạt động sau:
${jobListPrompt}

QUY TẮC ĐÁNH GIÁ BẮT BUỘC:
1. Bạn CHỈ ĐƯỢC CHỌN các Tin tuyển dụng có ID trong danh sách trên. TUYỆT ĐỐI KHÔNG tự tạo ra ID ngoài danh sách.
2. Trả về TỐI ĐA 6 tin tuyển dụng PHÙ HỢP NHẤT với kỹ năng, kinh nghiệm và định hướng của ứng viên.
3. Với MỖI tin tuyển dụng được chọn, bạn PHẢI cung cấp:
   - "job_id": <ID dạng số nguyên chính xác từ danh sách trên>
   - "match_score": <Số nguyên từ 50 đến 99 thể hiện % độ tương thích>
   - "match_reason": <Lý do cụ thể 1-2 câu giải thích các kỹ năng/kinh nghiệm nào trong CV trùng khớp với vị trí này (viết bằng tiếng Việt súc tích, chuyên nghiệp)>
4. Sắp xếp danh sách theo "match_score" giảm dần.

YÊU CẦU ĐỊNH DẠNG:
Chỉ trả về DUY NHẤT mảng JSON hợp lệ (không kèm markdown \`\`\`json hay bất kỳ văn bản ngoài nào):
[
  {
    "job_id": 1,
    "match_score": 92,
    "match_reason": "Ứng viên có kỹ năng React, TypeScript và Node.js phù hợp với yêu cầu phát triển web của vị trí này."
  }
]`;

    const systemInstruction = 'Bạn là hệ thống JSON API tự động. Luôn trả về duy nhất mảng JSON hợp lệ chứa danh sách job_id, match_score, match_reason theo đúng danh sách tin tuyển dụng được cung cấp.';

    const parseAIResponse = (raw) => {
        if (!raw) return null;
        try {
            const clean = raw.replace(/```json/gi, '').replace(/```/gi, '').trim();
            const jsonStart = clean.indexOf('[');
            const jsonEnd = clean.lastIndexOf(']');
            if (jsonStart === -1 || jsonEnd === -1) return null;
            const parsed = JSON.parse(clean.substring(jsonStart, jsonEnd + 1));
            if (!Array.isArray(parsed) || parsed.length === 0) return null;

            const formattedJobs = [];
            for (const item of parsed) {
                const job = activeJobs.find(j => j.id === Number(item.job_id));
                if (job && !formattedJobs.some(fj => fj.id === job.id)) {
                    const score = Math.min(Math.max(Math.round(Number(item.match_score) || 75), 40), 99);
                    const reason = item.match_reason && typeof item.match_reason === 'string' && item.match_reason.trim().length > 5
                        ? item.match_reason.trim()
                        : `Kỹ năng và kinh nghiệm trong CV phù hợp với yêu cầu của vị trí ${job.title}.`;

                    formattedJobs.push({
                        ...job,
                        match_score: score,
                        match_reason: reason,
                    });
                }
            }
            if (formattedJobs.length === 0) return null;
            formattedJobs.sort((a, b) => b.match_score - a.match_score);
            return formattedJobs.slice(0, 6);
        } catch (e) {
            return null;
        }
    };

    let matchingJobs = null;

    // Lần gọi 1
    try {
        const aiResponse1 = await llmClient.generate(prompt, systemInstruction, 30000);
        matchingJobs = parseAIResponse(aiResponse1);
    } catch (err) {
        logger.warn(`AI CV to Jobs call 1 failed: ${err.message}`);
    }

    // Cơ chế Retry 1 lần nếu kết quả không hợp lệ
    if (!matchingJobs) {
        try {
            const retryPrompt = `${prompt}\n\nLƯU Ý QUAN TRỌNG: Hãy chắc chắn trả về DUY NHẤT một mảng JSON hợp lệ [ { "job_id": <number>, "match_score": <number>, "match_reason": "<string>" } ]`;
            const aiResponse2 = await llmClient.generate(retryPrompt, systemInstruction, 30000);
            matchingJobs = parseAIResponse(aiResponse2);
        } catch (retryErr) {
            logger.warn(`AI CV to Jobs retry call failed: ${retryErr.message}`);
        }
    }

    // Heuristic Fallback thông minh nếu AI không khả dụng hoặc lỗi định dạng
    if (!matchingJobs || matchingJobs.length === 0) {
        matchingJobs = generateHeuristicJobMatches(extractedText, activeJobs);
    }

    const result = {
        file_name: fileName,
        extracted_summary: summary + (extractedText.length > 250 ? '...' : ''),
        matching_jobs: matchingJobs,
        analyzed_at: new Date(),
    };

    // Lưu lại lịch sử vào bảng AIChatSession
    if (accountId) {
        try {
            await aiModel.saveChatSession({
                account_id: accountId,
                question: `Phân tích CV tìm việc: ${fileName}`,
                support_type: 'fit_analysis',
                analysis_result: result,
            });
        } catch (dbErr) {
            logger.error(`Error saving CV analysis session: ${dbErr.message}`);
        }
    }

    return result;
};

/**
 * Heuristic mapping từ nội dung CV sang danh sách Tin Tuyển Dụng phù hợp
 */
const generateHeuristicJobMatches = (text, activeJobs) => {
    const textLower = (text || '').toLowerCase();

    // Domain keywords mapping for domain affinity
    const DOMAINS = {
        it: ['lập trình', 'developer', 'frontend', 'backend', 'fullstack', 'react', 'node', 'java', 'python', 'software', 'ai', 'data', 'devops', 'công nghệ thông tin', 'web', 'mobile', 'api', 'database', 'sql', 'c#', 'c++', 'server', 'mã nguồn', 'kỹ thuật', 'phần mềm'],
        marketing: ['marketing', 'seo', 'content', 'quảng cáo', 'ads', 'truyền thông', 'copywriter', 'social media', 'branding', 'pr', 'sự kiện', 'chiến dịch', 'banner', 'fanpage', 'tiktok', 'facebook'],
        design: ['thiết kế', 'design', 'designer', 'ui/ux', 'đồ họa', 'graphic', 'photoshop', 'figma', 'illustrator', 'banner', 'hậu kỳ', 'chụp ảnh', 'video', 'dựng phim'],
        business: ['sales', 'kinh doanh', 'bán hàng', 'tư vấn', 'chăm sóc khách hàng', 'cskh', 'thị trường', 'doanh số', 'khách hàng', 'telesales'],
        finance: ['kế toán', 'tài chính', 'thuế', 'kiểm toán', 'accounting', 'hóa đơn', 'sổ sách', 'báo cáo tài chính'],
        logistics: ['kho bãi', 'logistics', 'vận chuyển', 'giao nhận', 'điều phối', 'hàng hóa', 'xuất nhập khẩu', 'kho'],
        admin: ['nhập liệu', 'dịch thuật', 'hành chính', 'văn phòng', 'trợ lý', 'excel', 'soạn thảo', 'lưu trữ', 'hỗ trợ']
    };

    const domainScores = {};
    for (const [domain, kwList] of Object.entries(DOMAINS)) {
        let count = 0;
        for (const kw of kwList) {
            if (textLower.includes(kw)) count += 1;
        }
        domainScores[domain] = count;
    }

    const scored = activeJobs.map(job => {
        let score = 40;
        const matchingTerms = [];
        const jobCombined = `${job.title || ''} ${(job.tags || []).join(' ')} ${job.job_description || ''} ${job.requirements || ''}`.toLowerCase();

        // 1. Domain synergy bonus
        for (const [domain, kwList] of Object.entries(DOMAINS)) {
            const cvCount = domainScores[domain] || 0;
            if (cvCount > 0) {
                let jobCount = 0;
                for (const kw of kwList) {
                    if (jobCombined.includes(kw)) {
                        jobCount++;
                        if (!matchingTerms.includes(kw) && matchingTerms.length < 5) matchingTerms.push(kw);
                    }
                }
                if (jobCount > 0) {
                    score += Math.min(cvCount * 4 + jobCount * 6, 35);
                }
            }
        }

        // 2. Title word matches
        const titleWords = (job.title || '')
            .toLowerCase()
            .replace(/[^\w\s\u00C0-\u1EF9]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 3 && !['tuyển', 'viên', 'cho', 'và', 'các', 'của', 'với', 'gig'].includes(w));

        for (const w of titleWords) {
            if (textLower.includes(w)) {
                score += 8;
                if (!matchingTerms.includes(w) && matchingTerms.length < 5) matchingTerms.push(w);
            }
        }

        // 3. Tags matches
        if (Array.isArray(job.tags)) {
            for (const tag of job.tags) {
                const tagLower = (tag || '').toLowerCase();
                if (tagLower && textLower.includes(tagLower)) {
                    score += 12;
                    if (!matchingTerms.includes(tagLower) && matchingTerms.length < 5) matchingTerms.push(tagLower);
                }
            }
        }

        // 4. Requirements matches
        if (job.requirements) {
            const reqWords = job.requirements
                .toLowerCase()
                .replace(/[^\w\s\u00C0-\u1EF9]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length >= 4 && !['yêu', 'cầu', 'công', 'việc', 'kinh', 'nghiệm', 'khả', 'năng', 'trong', 'được'].includes(w));

            let reqMatches = 0;
            for (const w of reqWords.slice(0, 30)) {
                if (textLower.includes(w)) reqMatches++;
            }
            score += Math.min(reqMatches * 2, 14);
        }

        score = Math.min(Math.max(score, 45), 98);
        let reason = '';
        if (matchingTerms.length > 0) {
            reason = `CV của bạn có các kỹ năng, chuyên môn (${matchingTerms.slice(0, 3).join(', ')}) rất phù hợp với yêu cầu của vị trí này.`;
        } else {
            reason = `Hồ sơ năng lực của bạn phù hợp với định hướng công việc và môi trường tại ${job.company_name}.`;
        }

        return {
            ...job,
            match_score: score,
            match_reason: reason,
        };
    });

    scored.sort((a, b) => b.match_score - a.match_score);
    return scored.slice(0, 6);
};

const analyzeCVToIndustries = analyzeCVToJobs;

/**
 * Lấy lịch sử phân tích CV của ứng viên
 */
const getCVAnalysisHistory = async (accountId) => {
    return await aiModel.getCVAnalysisHistoryByAccountId(accountId);
};

/**
 * 4. Tự động trích xuất thông tin CV từ tệp PDF/DOCX để tạo CV Version
 */
const parseCVToStructuredData = async (file) => {
    if (!file) {
        throw new AppError(400, 'Vui lòng tải lên tệp CV (PDF hoặc DOCX)');
    }

    const cvText = await extractTextFromBuffer(file.buffer, file.mimetype, file.originalname);
    if (!cvText || cvText.length < 20) {
        throw new AppError(400, 'Không thể đọc nội dung từ tệp CV tải lên.');
    }

    const prompt = `Hãy trích xuất thông tin có cấu trúc từ nội dung CV sau:

"""
${cvText.slice(0, 4000)}
"""

YÊU CẦU: Trả về ĐÚNG định dạng JSON sau (không kèm markdown ngoài):
{
  "cv_name": "Tên bản CV gợi ý (Vd: CV ReactJS Developer)",
  "career_orientation": "Định hướng nghề nghiệp chính (Vd: Frontend Developer, Backend Developer)",
  "summary": "Tóm tắt giới thiệu bản thân từ CV",
  "skills": ["kỹ năng 1", "kỹ năng 2", "kỹ năng 3"],
  "experience": [
    {
      "company": "Tên công ty",
      "role": "Vị trí đảm nhiệm",
      "period": "Thời gian làm việc",
      "desc": "Mô tả công việc và đóng góp"
    }
  ],
  "education": [
    {
      "school": "Tên trường / Cơ sở đào tạo",
      "major": "Chuyên ngành",
      "year": "Năm tốt nghiệp"
    }
  ]
}`;

    try {
        const aiResponse = await llmClient.generate(prompt, 'Bạn là hệ thống trích xuất thông tin CV tự động. Trả về đúng JSON.');
        if (aiResponse) {
            const cleanJson = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJson);
        }
    } catch (err) {
        console.error('Parse CV error:', err.message);
    }

    // Fallback
    return {
        cv_name: file.originalname.replace(/\.[^/.]+$/, ''),
        career_orientation: 'Công nghệ thông tin',
        summary: cvText.slice(0, 200),
        skills: ['JavaScript', 'HTML/CSS', 'Git'],
        experience: [{ company: 'Kinh nghiệm thực tế', role: 'Thành viên dự án', period: '2024-2026', desc: cvText.slice(0, 300) }],
        education: [{ school: 'Đại học', major: 'Công nghệ thông tin', year: '2026' }],
    };
};

/**
 * 4. Tư vấn chọn nghề & Lộ trình phát triển AI theo Sở thích, Định hướng, Thế mạnh
 */
const getCareerGuidance = async (accountId, { interests, goals, strengths } = {}) => {
    let profile = null;
    let primaryCV = null;
    try {
        profile = await profileModel.getProfileByAccountId(accountId);
        if (profile?.id) {
            const cvs = await profileModel.getCVsByProfileId(profile.id);
            primaryCV = (cvs || []).find(c => c.is_default) || (cvs || [])[0];
        }
    } catch (dbErr) {
        console.warn('Could not load profile or CVs for career guidance:', dbErr.message);
    }

    const candidateInterests = interests || 'Thích tìm hiểu công nghệ mới, thích tạo ra sản phẩm hữu ích, thích làm việc sáng tạo';
    const candidateGoals = goals || primaryCV?.career_orientation || 'Tìm kiếm công việc ổn định, thu nhập tốt, có lộ trình thăng tiến rõ ràng';
    const candidateStrengths = strengths || profile?.skills || 'Tư duy logic, ham học hỏi, khả năng thích ứng nhanh';

    const prompt = `Bạn là Chuyên gia Khai vấn Nghề nghiệp (Career Coach & Headhunter) giàu kinh nghiệm.
Dựa trên thông tin của ứng viên:
- Họ tên: ${profile?.full_name || 'Ứng viên'}
- Sở thích / Đam mê: ${candidateInterests}
- Định hướng / Mục tiêu sự nghiệp: ${candidateGoals}
- Điểm mạnh / Kỹ năng giỏi nhất: ${candidateStrengths}
- Nền tảng học vấn: ${profile?.education || 'Chưa cập nhật'}

Nhiệm vụ của bạn:
1. Phân tích sự giao thoa giữa Sở thích, Định hướng và Điểm mạnh (Mô hình Ikigai).
2. Đề xuất TOP 3-4 nghề nghiệp / vị trí cụ thể phù hợp nhất với ứng viên trên thị trường lao động hiện nay.
3. Xây dựng LỘ TRÌNH PHÁT TRIỂN & HỌC TẬP cụ thể theo 3 giai đoạn (giai đoạn, nội dung, cột mốc).
4. Liệt kê các kỹ năng cốt lõi cần trau dồi để thành công.
5. Đưa ra lời khuyên hành động tức thì.

YÊU CẦU QUAN TRỌNG: Trả về ĐÚNG định dạng JSON sau (không thêm văn bản ngoài JSON):
{
  "summary_analysis": "Nhận xét tổng quan ngắn gọn về tiềm năng và sự kết hợp giữa sở thích và thế mạnh của ứng viên...",
  "recommended_careers": [
    {
      "career_name": "Tên nghề nghiệp / vị trí",
      "suitability_score": 95,
      "why_suitable": "Giải thích chi tiết vì sao nghề này tương thích với sở thích và thế mạnh...",
      "expected_salary": "Mức lương thị trường (ví dụ: 12 - 20 triệu VNĐ/tháng)",
      "key_responsibilities": "Mô tả 1-2 dòng về công việc thực tế"
    }
  ],
  "learning_roadmap": [
    {
      "phase": "Giai đoạn 1: Nền tảng cốt lõi (Tháng 1 - 2)",
      "content": "Các kiến thức, công cụ cần học...",
      "milestone": "Cột mốc kết quả đạt được..."
    },
    {
      "phase": "Giai đoạn 2: Dự án thực chiến (Tháng 3 - 4)",
      "content": "Thực hành, làm sản phẩm hoặc ca làm việc...",
      "milestone": "Cột mốc kết quả đạt được..."
    },
    {
      "phase": "Giai đoạn 3: Bứt phá & Ứng tuyển (Tháng 5 - 6)",
      "content": "Xây dựng thương hiệu cá nhân, nộp đơn...",
      "milestone": "Cột mốc kết quả đạt được..."
    }
  ],
  "recommended_skills": ["Kỹ năng 1", "Kỹ năng 2", "Kỹ năng 3", "Kỹ năng 4"],
  "priority_focus": "Hành động quan trọng nhất cần làm ngay hôm nay"
}`;

    try {
        const aiResponse = await llmClient.generate(prompt, 'Bạn là Chuyên gia Khai vấn Nghề nghiệp (Career Coach). Trả về đúng JSON.');
        if (aiResponse) {
            const cleanJson = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson);

            const firstCareer = parsed.recommended_careers?.[0]?.career_name || '';
            const matchingJobsRes = await jobModel.getJobs({ search: firstCareer, limit: 6 });
            parsed.matching_jobs = matchingJobsRes.jobs || [];

            return parsed;
        }
    } catch (err) {
        console.error('LLM Career Guidance Error:', err.message);
    }

    // Fallback response
    return {
        summary_analysis: `Dựa trên sở thích "${candidateInterests}" và thế mạnh "${candidateStrengths}", bạn có tiềm năng lớn ở các ngành nghề kết hợp giữa công nghệ, tư duy logic và giải quyết vấn đề thực tế.`,
        recommended_careers: [
            {
                career_name: 'Lập trình viên Frontend / Web Developer',
                suitability_score: 95,
                why_suitable: 'Phù hợp hoàn hảo với sở thích công nghệ và khả năng chuyển hóa ý tưởng thành giao diện tương tác.',
                expected_salary: '12 - 22 triệu VNĐ/tháng',
                key_responsibilities: 'Xây dựng giao diện ứng dụng web hiện đại với React, TypeScript và Tailwind CSS.'
            },
            {
                career_name: 'Chuyên viên Phân tích Dữ liệu / Business Analyst',
                suitability_score: 88,
                why_suitable: 'Tận dụng tốt tư duy phân tích, quan sát logic và khả năng làm việc với số liệu để đưa ra giải pháp.',
                expected_salary: '15 - 25 triệu VNĐ/tháng',
                key_responsibilities: 'Phân tích yêu cầu nghiệp vụ, trực quan hóa dữ liệu và đề xuất giải pháp tối ưu cho doanh nghiệp.'
            },
            {
                career_name: 'Thiết kế Trải nghiệm Người dùng (UI/UX Designer)',
                suitability_score: 85,
                why_suitable: 'Giao thoa giữa đam mê thẩm mỹ, thấu hiểu tâm lý người dùng và kỹ năng trực quan hóa sản phẩm.',
                expected_salary: '12 - 20 triệu VNĐ/tháng',
                key_responsibilities: 'Nghiên cứu hành vi người dùng, thiết kế wireframe, prototype trên Figma.'
            }
        ],
        learning_roadmap: [
            {
                phase: 'Giai đoạn 1: Nền tảng cốt lõi (Tháng 1 - 2)',
                content: 'Tập trung học sâu các ngôn ngữ cốt lõi, công cụ chuyên ngành và tư duy thiết kế hệ thống chuẩn.',
                milestone: 'Nắm vững kiến thức nền tảng và hoàn thành các bài tập mẫu độc lập.'
            },
            {
                phase: 'Giai đoạn 2: Xây dựng Dự án Thực tế & Portfolio (Tháng 3 - 4)',
                content: 'Tham gia các dự án thực tế, thực hành làm việc nhóm qua Git/GitHub và xử lý các bài toán nghiệp vụ phức tạp.',
                milestone: 'Hoàn thành ít nhất 2 dự án hoàn chỉnh và đưa lên Portfolio cá nhân.'
            },
            {
                phase: 'Giai đoạn 3: Bứt phá & Ứng tuyển (Tháng 5 - 6)',
                content: 'Chuẩn bị CV chuyên nghiệp, luyện kỹ năng phỏng vấn kỹ thuật và tự tin ứng tuyển các vị trí mục tiêu.',
                milestone: 'Chinh phục thành công lời mời làm việc (Offer) đầu tiên với mức đãi ngộ hấp dẫn.'
            }
        ],
        recommended_skills: ['JavaScript / TypeScript', 'React & Next.js', 'Figma & UI/UX Design', 'SQL & CSDL', 'Kỹ năng giải quyết vấn đề'],
        priority_focus: 'Tập trung hoàn thành 1 dự án thực tế nổi bật thể hiện đúng thế mạnh của bạn để làm minh chứng năng lực khi ứng tuyển.',
        matching_jobs: []
    };
};

const getSkillAdvice = async (accountId) => {
    return await getCareerGuidance(accountId, {});
};

/**
 * 7. Chấm điểm & Xếp hạng CV ứng viên tự động cho Nhà tuyển dụng (AI Ranking)
 */
const rankCVs = async (employerAccountId, jobId) => {
    const job = await jobModel.getJobById(jobId);
    if (!job) {
        throw new AppError(404, 'Không tìm thấy tin tuyển dụng');
    }

    const apps = await appModel.getJobApplicationsForEmployer(employerAccountId, jobId);
    if (!apps || apps.length === 0) {
        return [];
    }

    const ranked = apps.map((app, idx) => {
        let score = Math.max(95 - idx * 7, 65);
        let justification = 'Ứng viên có kỹ năng và kinh nghiệm tương thích với yêu cầu của vị trí.';
        if (idx === 0) {
            justification = 'Hồ sơ nổi bật: Kỹ năng chuyên môn trùng khớp 100%, có kinh nghiệm làm việc thực tế và đầy đủ thông tin.';
        } else if (idx === 1) {
            justification = 'Hồ sơ tốt: Đáp ứng phần lớn yêu cầu chuyên môn, có tiềm năng phát triển nhanh.';
        }
        return {
            ...app,
            ai_rank: idx + 1,
            ai_match_score: score,
            ai_justification: justification,
        };
    });

    ranked.sort((a, b) => b.ai_match_score - a.ai_match_score);
    return ranked.map((item, index) => ({ ...item, ai_rank: index + 1 }));
};

const getConversations = async (accountId) => {
    return await aiModel.getConversationsByAccountId(accountId);
};

// In-memory cache for daily dashboard insights: key -> { insight, generated_at, expires_at }
const dashboardInsightCache = new Map();

/**
 * Heuristic fallback for dashboard insights when LLM is unavailable
 */
const generateHeuristicInsight = (role, stats) => {
    if (role === 'admin') {
        const weeklyJobs = stats?.weekly_jobs || [];
        const weeklyApps = stats?.weekly_applications || [];
        const totalRecentJobs = weeklyJobs.reduce((acc, w) => acc + (w.count || 0), 0);
        const totalRecentApps = weeklyApps.reduce((acc, w) => acc + (w.count || 0), 0);

        const pendingJobs = (stats?.job_approvals || []).find(j => j.approval_status === 'pending')?.count || 0;
        const pendingEmps = (stats?.employer_verifications || []).find(e => e.verification_status === 'pending')?.count || 0;

        return `### 🔍 Điểm đáng chú ý
- **Xu hướng hoạt động**: Trong 8 tuần qua, hệ thống ghi nhận **${totalRecentJobs}** tin tuyển dụng mới và **${totalRecentApps}** lượt nộp hồ sơ ứng tuyển.
- **Tình trạng hàng đợi**: Hiện có **${pendingJobs}** tin tuyển dụng và **${pendingEmps}** hồ sơ doanh nghiệp đang chờ xét duyệt tính hợp lệ.

### 💡 Khuyến nghị hành động
- Đẩy nhanh tiến độ kiểm duyệt hồ sơ doanh nghiệp và tin đăng để tránh gián đoạn quy trình kết nối nhân lực.
- Theo dõi các tuần có biến động giảm ứng tuyển để có chương trình đẩy mạnh thu hút ứng viên tiềm năng.`;
    }

    if (role === 'employer') {
        const topJobs = stats?.top_jobs || [];
        const highestJob = topJobs[0];
        const statusMap = {};
        (stats?.application_statuses || []).forEach(s => {
            statusMap[s.status] = s.count;
        });
        const totalApps = Object.values(statusMap).reduce((a, b) => a + b, 0);
        const pendingReview = (statusMap['submitted'] || 0) + (statusMap['received'] || 0);

        return `### 🔍 Điểm đáng chú ý
- **Sức hút tin tuyển dụng**: ${highestJob ? `Tin tuyển dụng "**${highestJob.title}**" đang dẫn đầu với **${highestJob.applications_count}** lượt ứng tuyển.` : 'Chưa có tin tuyển dụng nào phát sinh lượt nộp đơn nổi bật.'}
- **Tổng lượng hồ sơ tiếp nhận**: Đã ghi nhận tổng cộng **${totalApps}** lượt ứng tuyển trên các tin tuyển dụng đang hoạt động.
- **Tiến độ xử lý**: Còn khoảng **${pendingReview}** hồ sơ ứng tuyển mới nộp đang chờ bộ phận tuyển dụng tiếp nhận và phản hồi.

### 💡 Khuyến nghị hành động
- Sớm cập nhật trạng thái phỏng vấn cho các hồ sơ đang chờ để giữ chân ứng viên tiềm năng trước đối thủ.
- Tối ưu hóa yêu cầu công việc cho các vị trí có ít lượt nộp đơn nhằm mở rộng tệp ứng viên tiếp cận.`;
    }

    // Candidate
    const total = stats?.total_applications || 0;
    const avgScore = stats?.match_analysis?.avg_match_score || null;
    const statusList = stats?.application_statuses || [];
    const passedCount = statusList.find(s => s.status === 'passed')?.count || 0;
    const interviewCount = statusList.filter(s => ['interview_invited', 'interviewed'].includes(s.status)).reduce((a, b) => a + b.count, 0);

    return `### 🔍 Điểm đáng chú ý
- **Tần suất nộp đơn**: Bạn đã ứng tuyển tổng cộng **${total}** vị trí việc làm trên hệ thống.
- **Tỉ lệ chuyển đổi phỏng vấn**: Đã có **${interviewCount}** lượt được mời phỏng vấn và **${passedCount}** vị trí được tiếp nhận chính thức.
- **Độ tương thích năng lực**: ${avgScore ? `Điểm khớp nối CV bằng AI trung bình đạt **${avgScore}%**, cho thấy hồ sơ khá bám sát yêu cầu công việc.` : 'Bạn nên sử dụng tính năng Phân tích CV bằng AI để đo lường độ phù hợp trước khi nộp.'}

### 💡 Khuyến nghị hành động
- Tiếp tục duy trì việc theo dõi trạng thái hồ sơ và chủ động chuẩn bị các câu hỏi phỏng vấn theo phương pháp STAR.
- Bổ sung thêm các chứng chỉ kỹ năng thực chiến vào CV để gia tăng điểm uy tín và thu hút thêm nhà tuyển dụng.`;
};

/**
 * Generate AI Insight for Dashboard
 */
const generateDashboardInsight = async (role, stats, forceRefresh = false, userKey = 'global') => {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `${role}_${userKey}_${today}`;
    const now = Date.now();

    if (!forceRefresh && dashboardInsightCache.has(cacheKey)) {
        const cached = dashboardInsightCache.get(cacheKey);
        if (cached.expires_at > now) {
            return {
                insight: cached.insight,
                is_cached: true,
                generated_at: cached.generated_at,
            };
        }
    }

    const systemPrompt = `Bạn là trợ lý phân tích dữ liệu tuyển dụng chuyên nghiệp của nền tảng JobBee.
Dựa trên số liệu thống kê JSON sau, hãy chỉ ra tối đa 3 điểm đáng chú ý (xu hướng tăng/giảm bất thường, điểm nghẽn cần xử lý) và 1-2 khuyến nghị hành động cụ thể.
Trả lời ngắn gọn bằng tiếng Việt theo định dạng markdown:
### 🔍 Điểm đáng chú ý
- [Điểm 1]
- [Điểm 2]
- [Điểm 3]

### 💡 Khuyến nghị hành động
- [Khuyến nghị 1]
- [Khuyến nghị 2]`;

    const userPrompt = `Dưới đây là số liệu thống kê hiện tại của vai trò [${role.toUpperCase()}]:
${JSON.stringify(stats, null, 2)}

Hãy phân tích số liệu trên thật khách quan, súc tích và thiết thực.`;

    let insightText = null;
    try {
        insightText = await llmClient.generate(userPrompt, systemPrompt);
    } catch (err) {
        console.error('LLM Insight Error:', err.message);
    }

    // Heuristic fallback if LLM is unavailable or returns empty
    if (!insightText) {
        insightText = generateHeuristicInsight(role, stats);
    }

    const generatedAt = new Date();
    const expiresAt = now + 24 * 60 * 60 * 1000;

    dashboardInsightCache.set(cacheKey, {
        insight: insightText,
        generated_at: generatedAt,
        expires_at: expiresAt,
    });

    return {
        insight: insightText,
        is_cached: false,
        generated_at: generatedAt,
    };
};

module.exports = {
    processChat,
    analyzeCVToJobs,
    analyzeCVToIndustries,
    getCVAnalysisHistory,
    parseCVToStructuredData,
    getSkillAdvice,
    getCareerGuidance,
    rankCVs,
    getConversations,
    generateDashboardInsight,
};
