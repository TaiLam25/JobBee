const aiService = require('./ai.service');
const statsService = require('./stats.service');
const AppError = require('../../utils/app-error');
const { sendResponse } = require('../../utils/response');

const processChat = async (req, res, next) => {
    try {
        const accountId = req.user?.id || null;
        const result = await aiService.processChat(accountId, req.body);
        return sendResponse(res, 200, 'Trợ lý AI phản hồi thành công', result);
    } catch (error) {
        next(error);
    }
};

const analyzeMatch = async (req, res, next) => {
    try {
        const analysis = await aiService.analyzeMatch(req.user.id, req.body);
        return sendResponse(res, 200, 'Phân tích mức độ phù hợp thành công', analysis);
    } catch (error) {
        next(error);
    }
};

const analyzeCVFile = async (req, res, next) => {
    try {
        const accountId = req.user?.id || null;
        const analysis = await aiService.analyzeCVFile(accountId, req.file, req.body);
        return sendResponse(res, 200, 'Phân tích tệp CV bằng AI thành công', analysis);
    } catch (error) {
        next(error);
    }
};

const parseCVFile = async (req, res, next) => {
    try {
        const data = await aiService.parseCVToStructuredData(req.file);
        return sendResponse(res, 200, 'Trích xuất thông tin CV bằng AI thành công', data);
    } catch (error) {
        next(error);
    }
};

const getJobSuggestions = async (req, res, next) => {
    try {
        const suggestions = await aiService.getJobSuggestions(req.user.id);
        return sendResponse(res, 200, 'Gợi ý tin tuyển dụng phù hợp từ AI', suggestions);
    } catch (error) {
        next(error);
    }
};

const getSkillAdvice = async (req, res, next) => {
    try {
        const advice = await aiService.getSkillAdvice(req.user.id);
        return sendResponse(res, 200, 'Tư vấn kỹ năng bổ sung thành công', advice);
    } catch (error) {
        next(error);
    }
};

const getCareerGuidance = async (req, res, next) => {
    try {
        const { interests, goals, strengths } = req.body || {};
        const result = await aiService.getCareerGuidance(req.user.id, { interests, goals, strengths });
        return sendResponse(res, 200, 'Tư vấn chọn nghề và lộ trình phát triển AI thành công', result);
    } catch (error) {
        next(error);
    }
};

const rankCVs = async (req, res, next) => {
    try {
        const ranked = await aiService.rankCVs(req.user.id, req.params.id);
        return sendResponse(res, 200, 'Chấm điểm và xếp hạng CV ứng viên bằng AI thành công', ranked);
    } catch (error) {
        next(error);
    }
};

const getConversations = async (req, res, next) => {
    try {
        const list = await aiService.getConversations(req.user.id);
        return sendResponse(res, 200, 'Lấy lịch sử trò chuyện AI thành công', list);
    } catch (error) {
        next(error);
    }
};

const getDashboardInsight = async (req, res, next) => {
    try {
        const { role } = req.params;
        const validRoles = ['admin', 'employer', 'candidate'];
        if (!validRoles.includes(role)) {
            throw new AppError(400, 'Vai trò không hợp lệ. Chỉ hỗ trợ admin, employer, candidate');
        }

        // Authorization check: admin can view any, otherwise users can only view their own role
        if (req.user.role !== 'admin' && req.user.role !== role) {
            throw new AppError(403, 'Bạn không có quyền xem thống kê phân tích của vai trò này');
        }

        let stats = null;
        let userKey = 'global';

        if (role === 'admin') {
            stats = await statsService.getAdminStatsSummary();
            userKey = 'admin_global';
        } else if (role === 'employer') {
            stats = await statsService.getEmployerStatsSummary(req.user.id);
            userKey = `employer_${req.user.id}`;
        } else if (role === 'candidate') {
            stats = await statsService.getCandidateStatsSummary(req.user.id);
            userKey = `candidate_${req.user.id}`;
        }

        const forceRefresh = req.query.refresh === 'true';
        const aiResult = await aiService.generateDashboardInsight(role, stats, forceRefresh, userKey);

        return sendResponse(res, 200, 'Lấy phân tích thống kê và nhận định AI thành công', {
            role,
            stats,
            insight: aiResult.insight,
            is_cached: aiResult.is_cached,
            generated_at: aiResult.generated_at,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    processChat,
    analyzeMatch,
    analyzeCVFile,
    parseCVFile,
    getJobSuggestions,
    getSkillAdvice,
    getCareerGuidance,
    rankCVs,
    getConversations,
    getDashboardInsight,
};
