const adminService = require('./admin.service');
const { sendResponse } = require('../../utils/response');

const getPendingEmployers = async (req, res, next) => {
    try {
        const result = await adminService.getPendingEmployers(req.query);
        return sendResponse(res, 200, 'Lấy danh sách doanh nghiệp chờ xác minh thành công', result.employers, result.meta);
    } catch (error) {
        next(error);
    }
};

const getEmployers = async (req, res, next) => {
    try {
        const result = await adminService.getEmployers(req.query);
        return sendResponse(res, 200, 'Lấy danh sách doanh nghiệp thành công', result.employers, result.meta);
    } catch (error) {
        next(error);
    }
};

const getEmployerById = async (req, res, next) => {
    try {
        const employer = await adminService.getEmployerDetail(req.params.id);
        return sendResponse(res, 200, 'Lấy chi tiết hồ sơ doanh nghiệp thành công', employer);
    } catch (error) {
        next(error);
    }
};

const getVerificationDocSignedUrl = async (req, res, next) => {
    try {
        const docData = await adminService.getSignedVerificationDocUrl(req.params.id);
        return sendResponse(res, 200, 'Lấy liên kết tài liệu xác minh thành công', docData);
    } catch (error) {
        next(error);
    }
};

const verifyEmployer = async (req, res, next) => {
    try {
        const updated = await adminService.verifyEmployer(req.params.id, req.body);
        return sendResponse(res, 200, 'Xét duyệt xác minh doanh nghiệp thành công', updated);
    } catch (error) {
        next(error);
    }
};

const getPendingJobs = async (req, res, next) => {
    try {
        const result = await adminService.getPendingJobs(req.query);
        return sendResponse(res, 200, 'Lấy danh sách tin tuyển dụng chờ kiểm duyệt thành công', result.jobs, result.meta);
    } catch (error) {
        next(error);
    }
};

const moderateJob = async (req, res, next) => {
    try {
        const updated = await adminService.moderateJob(req.params.id, req.body);
        return sendResponse(res, 200, 'Kiểm duyệt tin tuyển dụng thành công', updated);
    } catch (error) {
        next(error);
    }
};

const getAccounts = async (req, res, next) => {
    try {
        const result = await adminService.getAccounts(req.query);
        return sendResponse(res, 200, 'Lấy danh sách tài khoản hệ thống thành công', result.accounts, result.meta);
    } catch (error) {
        next(error);
    }
};

const toggleLockAccount = async (req, res, next) => {
    try {
        const updated = await adminService.toggleLockAccount(req.params.id, req.body);
        return sendResponse(res, 200, 'Khóa / Mở khóa tài khoản thành công', updated);
    } catch (error) {
        next(error);
    }
};

const getStatistics = async (req, res, next) => {
    try {
        const stats = await adminService.getStatistics();
        return sendResponse(res, 200, 'Lấy thống kê hệ thống thành công', stats);
    } catch (error) {
        next(error);
    }
};

const getAdminAnalytics = async (req, res, next) => {
    try {
        const analytics = await adminService.getAdminAnalytics(req.query);
        return sendResponse(res, 200, 'Lấy dữ liệu phân tích quản trị thành công', analytics);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getPendingEmployers,
    getEmployers,
    getEmployerById,
    getVerificationDocSignedUrl,
    verifyEmployer,
    getPendingJobs,
    moderateJob,
    getAccounts,
    toggleLockAccount,
    getStatistics,
    getAdminAnalytics,
};
