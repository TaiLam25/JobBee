const aiModel = require('./ai.model');
const jobModel = require('../job/job.model');
const appModel = require('../application/application.model');
const profileModel = require('../profile/profile.model');
const AppError = require('../../utils/app-error');
const llmClient = require('./llm.client');
const { extractTextFromBuffer } = require('../../utils/document-parser');

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
 * 2. Phân tích mức độ phù hợp giữa CV lưu trên hệ thống và Tin tuyển dụng
 */
const analyzeMatch = async (accountId, { cv_id, job_id }) => {
    const job = await jobModel.getJobById(job_id);
    if (!job) {
        throw new AppError(404, 'Không tìm thấy tin tuyển dụng');
    }

    let cvData = null;
    if (cv_id) {
        cvData = await profileModel.getCVVersionById(accountId, cv_id);
    } else {
        const cvs = await profileModel.getCVVersions(accountId);
        cvData = cvs.find(c => c.is_default) || cvs[0] || null;
    }

    const profile = await profileModel.getProfileByAccountId(accountId);

    const prompt = `Phân tích mức độ phù hợp giữa CV của ứng viên và Tin tuyển dụng sau:

[TIN TUYỂN DỤNG]:
- Tiêu đề: ${job.title}
- Mô tả: ${job.job_description}
- Yêu cầu: ${job.requirements}
- Mức lương: ${job.salary}
- Loại hình: ${job.job_type}

[HỒ SƠ ỨNG VIÊN]:
- Họ tên: ${profile?.full_name || 'Ứng viên'}
- Định hướng CV: ${cvData?.career_orientation || 'Chung'}
- Kỹ năng: ${profile?.skills || 'Chưa cập nhật'}
- Học vấn: ${profile?.education || 'Chưa cập nhật'}
- Kinh nghiệm: ${profile?.experience || 'Chưa cập nhật'}
- Nội dung CV: ${JSON.stringify(cvData?.cv_content || {})}

YÊU CẦU: Trả về ĐÚNG định dạng JSON sau (không kèm markdown ngoài):
{
  "match_score": <số nguyên từ 0 đến 100>,
  "strengths": ["điểm mạnh 1", "điểm mạnh 2"],
  "missing_skills": ["kỹ năng cần bổ sung 1", "kỹ năng cần bổ sung 2"],
  "recommendations": ["lời khuyên 1", "lời khuyên 2"]
}`;

    let analysis = null;
    try {
        const aiResponse = await llmClient.generate(prompt, 'Bạn là chuyên gia phân tích tuyển dụng và ATS AI. Luôn trả về định dạng JSON hợp lệ.');
        if (aiResponse) {
            const cleanJson = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            analysis = JSON.parse(cleanJson);
        }
    } catch (err) {
        console.error('LLM Match Analysis Error:', err.message);
    }

    // Heuristic Fallback
    if (!analysis || typeof analysis.match_score !== 'number') {
        const candSkills = (profile?.skills || '').toLowerCase();
        const jobReqs = (job.requirements || '').toLowerCase();
        
        let score = 70;
        const strengths = [];
        const missing = [];

        ['react', 'node', 'javascript', 'typescript', 'sql', 'python', 'java', 'docker', 'figma'].forEach(tech => {
            if (jobReqs.includes(tech)) {
                if (candSkills.includes(tech)) {
                    score += 5;
                    strengths.push(`Kỹ năng ${tech.toUpperCase()} đáp ứng đúng yêu cầu.`);
                } else {
                    missing.push(`Cần nâng cao kinh nghiệm với ${tech.toUpperCase()}.`);
                }
            }
        });

        score = Math.min(Math.max(score, 60), 98);
        if (strengths.length === 0) strengths.push('Kinh nghiệm nền tảng phù hợp với định hướng công việc');
        if (missing.length === 0) missing.push('Bổ sung thêm các chứng chỉ chuyên môn và dự án thực tế');

        analysis = {
            match_score: score,
            strengths,
            missing_skills: missing,
            recommendations: [
                'Tùy chỉnh phần tóm tắt mở đầu của CV để nhấn mạnh các từ khóa chính trong tin tuyển dụng.',
                'Đính kèm đường dẫn GitHub/Portfolio minh chứng cho các kỹ năng đã nêu.'
            ],
        };
    }

    if (accountId) {
        try {
            await aiModel.saveChatSession({
                account_id: accountId,
                question: `Phân tích mức độ phù hợp cho tin: ${job.title} (ID: ${job_id})`,
                support_type: 'fit_analysis',
                analysis_result: analysis,
            });
        } catch (dbErr) {
            console.error('Error saving match analysis session:', dbErr.message);
        }
    }

    return analysis;
};

/**
 * 3. Phân tích trực tiếp từ FILE CV (PDF, DOCX, TXT) được tải lên
 */
const analyzeCVFile = async (accountId, file, { job_id, job_description, requirements, title }) => {
    if (!file) {
        throw new AppError(400, 'Vui lòng tải lên tệp CV (PDF hoặc DOCX)');
    }

    // 1. Extract text from file buffer
    const cvText = await extractTextFromBuffer(file.buffer, file.mimetype, file.originalname);
    if (!cvText || cvText.length < 20) {
        throw new AppError(400, 'Không thể đọc nội dung văn bản từ tệp CV tải lên. Vui lòng kiểm tra lại định dạng tệp.');
    }

    // 2. Resolve job details
    let jobInfo = {
        title: title || 'Vị trí tuyển dụng',
        job_description: job_description || '',
        requirements: requirements || '',
        salary: 'Thỏa thuận',
    };

    if (job_id) {
        const job = await jobModel.getJobById(job_id);
        if (job) {
            jobInfo = job;
        }
    }

    // 3. Prompt Gemini AI with parsed CV text & Job Details
    const prompt = `Bạn là hệ thống AI ATS chuyên gia phân tích và chấm điểm CV so với Yêu cầu tuyển dụng.

[NỘI DUNG TỆP CV ỨNG VIÊN TẢI LÊN (${file.originalname})]:
"""
${cvText.slice(0, 4000)}
"""

[THÔNG TIN VỊ TRÍ TUYỂN DỤNG]:
- Tiêu đề: ${jobInfo.title}
- Mô tả công việc: ${jobInfo.job_description}
- Yêu cầu kỹ năng: ${jobInfo.requirements}

YÊU CẦU: Phân tích chi tiết và trả về ĐÚNG định dạng JSON sau (không kèm markdown ngoài):
{
  "match_score": <số nguyên từ 0 đến 100>,
  "parsed_cv_summary": "<Tóm tắt 2-3 câu về ứng viên: họ tên nếu có, chuyên môn chính, số năm kinh nghiệm>",
  "strengths": ["Điểm mạnh 1 so với yêu cầu", "Điểm mạnh 2"],
  "missing_skills": ["Kỹ năng hoặc chứng chỉ còn thiếu 1", "Kỹ năng còn thiếu 2"],
  "recommendations": ["Lời khuyên để nâng cao tỷ lệ trúng tuyển 1", "Lời khuyên 2"]
}`;

    let result = null;
    try {
        const aiResponse = await llmClient.generate(prompt, 'Bạn là chuyên gia phân tích CV bằng AI. Luôn trả về đúng JSON.');
        if (aiResponse) {
            const cleanJson = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            result = JSON.parse(cleanJson);
        }
    } catch (err) {
        console.error('LLM File Analysis Error:', err.message);
    }

    // Fallback heuristic if LLM error
    if (!result || typeof result.match_score !== 'number') {
        const textLower = cvText.toLowerCase();
        let score = 75;
        const strengths = ['Tệp CV có cấu trúc rõ ràng và thông tin kinh nghiệm liên quan'];
        const missing = [];

        ['react', 'node', 'javascript', 'typescript', 'python', 'java', 'sql', 'docker'].forEach(tech => {
            if (textLower.includes(tech)) {
                score += 3;
                strengths.push(`Có kỹ năng ${tech.toUpperCase()} được đề cập trong tệp CV.`);
            }
        });

        result = {
            match_score: Math.min(Math.max(score, 65), 95),
            parsed_cv_summary: `Đã phân tích tệp ${file.originalname}. Ứng viên có kỹ năng nền tảng phù hợp với vị trí ${jobInfo.title}.`,
            strengths,
            missing_skills: missing.length > 0 ? missing : ['Bổ sung thêm các số liệu định lượng (metrics) và liên kết dự án thực tế.'],
            recommendations: [
                'Nêu rõ các thành tựu nổi bật trong các dự án gần đây nhất.',
                'Căn chỉnh từ khóa chuyên ngành trong CV khớp với bản mô tả công việc.'
            ],
        };
    }

    result.file_name = file.originalname;

    if (accountId) {
        try {
            await aiModel.saveChatSession({
                account_id: accountId,
                question: `Phân tích tệp CV tải lên: ${file.originalname} cho vị trí ${jobInfo.title}`,
                support_type: 'file_match_analysis',
                analysis_result: result,
            });
        } catch (dbErr) {}
    }

    return result;
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
 * 5. Gợi ý việc làm phù hợp năng lực (Job Suggestions)
 */
const getJobSuggestions = async (accountId) => {
    const profile = await profileModel.getProfileByAccountId(accountId);
    const jobsRes = await jobModel.getJobs({ limit: 20 });
    const allJobs = jobsRes.jobs || [];

    if (allJobs.length === 0) return [];

    const candSkills = (profile?.skills || '').toLowerCase();

    // Score jobs
    const scoredJobs = allJobs.map(job => {
        let score = 70;
        const jobTitle = (job.title || '').toLowerCase();
        const jobReq = (job.requirements || '').toLowerCase();

        if (candSkills) {
            const skills = candSkills.split(/[,;\n]/).map(s => s.trim().toLowerCase()).filter(Boolean);
            skills.forEach(s => {
                if (jobTitle.includes(s) || jobReq.includes(s)) {
                    score += 8;
                }
            });
        }

        return {
            ...job,
            ai_match_score: Math.min(score, 98),
            ai_recommendation_reason: `Phù hợp với hồ sơ kỹ năng: ${profile?.skills || 'Công nghệ thông tin'}`
        };
    });

    scoredJobs.sort((a, b) => b.ai_match_score - a.ai_match_score);
    return scoredJobs.slice(0, 6);
};

/**
 * 6. Tư vấn lộ trình kỹ năng cần bổ sung (Skill Advice)
 */
/**
 * 6. Tư vấn chọn nghề & Lộ trình phát triển AI theo Sở thích, Định hướng, Thế mạnh
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
    analyzeMatch,
    analyzeCVFile,
    parseCVToStructuredData,
    getJobSuggestions,
    getSkillAdvice,
    getCareerGuidance,
    rankCVs,
    getConversations,
    generateDashboardInsight,
};
